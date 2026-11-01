"""Servicio de pruebas de extremo a extremo (sin HTTP): generación, reloj, pausa, entrega y calificación."""
import json
import random
import threading

import pytest

from app.comun.errores import IATiempoAgotado
from app.pruebas import sesion
from app.pruebas.errores import (
    ConfiguracionPruebaInvalida,
    ContenidoInsuficiente,
    DistribucionInvalida,
    EstadoPruebaInvalido,
    GeneracionIncompleta,
    PausaNoPermitida,
    PruebaExpirada,
    PruebaInvalida,
)
from app.pruebas.esquemas import ConfiguracionEntrada, ResumenFuente, SolicitudCrear
from app.pruebas.sello import Sellador
from app.pruebas.servicio_prueba import CacheIdempotente, ServicioPruebas
from pruebas.ia_pruebas_falsa import IAGeneradora, resumen_de_ejemplo


class Reloj:
    def __init__(self, inicio: float = 1_000_000.0):
        self.t = inicio

    def __call__(self) -> float:
        return self.t

    def avanzar(self, segundos: float) -> None:
        self.t += segundos


def solicitud(*, cantidad=10, dificultad="media", personalizada=None, minutos=15, asistido=False, pausa=True, id_solicitud="intento-0001", resumen=None) -> SolicitudCrear:
    return SolicitudCrear(
        id_solicitud=id_solicitud,
        id_tema="tema-1",
        titulo_tema="Ondas",
        resumen=resumen or resumen_de_ejemplo(),
        configuracion=ConfiguracionEntrada(
            cantidad_preguntas=cantidad,
            dificultad=dificultad,
            distribucion_personalizada=personalizada,
            limite_minutos=minutos,
            modo_asistido=asistido,
            pausa_blindada=pausa,
        ),
    )


@pytest.fixture
def reloj():
    return Reloj()


@pytest.fixture
def ia():
    return IAGeneradora()


@pytest.fixture
def servicio(ia, reloj):
    return ServicioPruebas(ia, Sellador("clave-de-pruebas"), ahora=reloj, aleatorio=random.Random(7), cache=CacheIdempotente())


def crear_e_iniciar(servicio, **kw):
    creada = servicio.crear(solicitud(**kw))
    return creada, servicio.iniciar(creada["sello"])


# ------------------------------------------------------------------ Generación


@pytest.mark.parametrize("cantidad", [5, 10, 15, 20, 25])
def test_genera_exactamente_la_cantidad_pedida(servicio, cantidad):
    creada = servicio.crear(solicitud(cantidad=cantidad))
    assert creada["prueba"]["total"] == cantidad
    assert creada["prueba"]["estado"] == "lista"
    assert creada["prueba"]["preguntas"] is None  # todavía no se entregan


def test_respeta_la_distribucion_predefinida(servicio):
    iniciada = servicio.iniciar(servicio.crear(solicitud(cantidad=20, dificultad="media"))["sello"])
    niveles = [p["dificultad"] for p in iniciada["prueba"]["preguntas"]]
    assert {n: niveles.count(n) for n in ("facil", "media", "dificil")} == {"facil": 4, "media": 12, "dificil": 4}


def test_respeta_la_distribucion_personalizada_incluso_con_ceros(servicio):
    reparto = {"facil": 0, "media": 15, "dificil": 5}
    iniciada = servicio.iniciar(servicio.crear(solicitud(cantidad=20, dificultad="personalizada", personalizada=reparto))["sello"])
    niveles = [p["dificultad"] for p in iniciada["prueba"]["preguntas"]]
    assert {n: niveles.count(n) for n in reparto} == reparto
    assert iniciada["prueba"]["puntaje_maximo"] == 15 + 10


def test_distribucion_personalizada_incompleta_se_rechaza_sin_llamar_a_la_ia(servicio, ia):
    with pytest.raises(DistribucionInvalida):
        servicio.crear(solicitud(cantidad=20, dificultad="personalizada", personalizada={"facil": 5, "media": 10, "dificil": 4}))
    assert ia.llamadas == []


def test_cantidad_no_permitida_se_rechaza(servicio):
    with pytest.raises(ConfiguracionPruebaInvalida):
        servicio.crear(solicitud(cantidad=7))


def test_las_preguntas_son_distintas_y_cada_una_tiene_cuatro_alternativas_con_una_correcta(servicio):
    _, iniciada = crear_e_iniciar(servicio, cantidad=25)
    preguntas = iniciada["prueba"]["preguntas"]
    assert len({p["enunciado"] for p in preguntas}) == 25
    assert len({p["id"] for p in preguntas}) == 25
    for p in preguntas:
        assert [o["id"] for o in p["opciones"]] == ["a", "b", "c", "d"]
        assert len({o["texto"] for o in p["opciones"]}) == 4


def test_la_posicion_de_la_correcta_no_depende_del_orden_de_la_ia(servicio):
    creada = servicio.crear(solicitud(cantidad=25))
    estado = servicio._sellador.abrir(creada["sello"])
    posiciones = {p["correcta"] for p in estado["preguntas"]}
    assert len(posiciones) >= 3  # la IA siempre pone la correcta primera; el servidor la reparte


def test_las_preguntas_nacen_del_resumen_y_se_usa_el_tiempo_de_espera_configurado(servicio, ia):
    servicio.crear(solicitud(cantidad=10))
    assert ia.llamadas and all("<resumen>" in c["entrada"] and "cresta" in c["entrada"] for c in ia.llamadas)
    assert all(c["timeout_segundos"] == 120.0 for c in ia.llamadas)


def test_cantidades_grandes_se_piden_en_lotes_y_cada_lote_tiene_su_enfoque(servicio, ia):
    servicio.crear(solicitud(cantidad=25))
    assert len(ia.llamadas) == 3
    assert sum("Prioriza" in c["entrada"] for c in ia.llamadas) == 3


def test_el_resumen_es_la_unica_fuente_y_se_registra_su_huella(servicio):
    a = servicio._sellador.abrir(servicio.crear(solicitud(id_solicitud="a-0000001"))["sello"])
    b = servicio._sellador.abrir(servicio.crear(solicitud(id_solicitud="b-0000001", resumen=resumen_de_ejemplo(12)))["sello"])
    assert a["huella_resumen"] != b["huella_resumen"]


def test_resumen_demasiado_breve(servicio, ia):
    corto = ResumenFuente.model_validate({"titulo": "x", "introduccion": "Un texto muy corto.", "secciones": []})
    with pytest.raises(ContenidoInsuficiente):
        servicio.crear(solicitud(resumen=corto))
    assert ia.llamadas == []


def test_el_resumen_no_alcanza_para_la_cantidad_pedida(servicio, ia):
    mediano = resumen_de_ejemplo(6)  # ~2.000 caracteres → unas 6 preguntas
    with pytest.raises(ContenidoInsuficiente) as error:
        servicio.crear(solicitud(cantidad=25, resumen=mediano))
    assert "menor" in str(error.value)
    assert ia.llamadas == []


def test_la_ia_devuelve_basura_una_vez_y_se_reintenta(reloj):
    ia = IAGeneradora(fallos_iniciales=1)
    servicio = ServicioPruebas(ia, Sellador("k"), ahora=reloj, cache=CacheIdempotente())
    assert servicio.crear(solicitud(cantidad=5))["prueba"]["total"] == 5
    assert len(ia.llamadas) == 2


def test_la_ia_devuelve_de_menos_y_se_completa_la_diferencia(reloj):
    ia = IAGeneradora(de_menos=2)
    servicio = ServicioPruebas(ia, Sellador("k"), ahora=reloj, cache=CacheIdempotente())
    # Cada llamada omite 2 preguntas pero la ronda de reposición pide con margen: acaba completa.
    assert servicio.crear(solicitud(cantidad=10))["prueba"]["total"] == 10


def test_si_no_se_consiguen_todas_las_preguntas_no_se_entrega_otra_prueba(reloj):
    ia = IAGeneradora(mala_calidad=True)
    servicio = ServicioPruebas(ia, Sellador("k"), ahora=reloj, cache=CacheIdempotente())
    with pytest.raises(GeneracionIncompleta):
        servicio.crear(solicitud(cantidad=5))
    assert len(ia.llamadas) == 3  # límite de rondas: no hay bucles ni gasto ilimitado


def test_un_fallo_de_openai_se_propaga_y_no_deja_pruebas_a_medias(reloj):
    ia = IAGeneradora(error=IATiempoAgotado())
    servicio = ServicioPruebas(ia, Sellador("k"), ahora=reloj, cache=CacheIdempotente())
    with pytest.raises(IATiempoAgotado):
        servicio.crear(solicitud(cantidad=5))
    ia._error = None  # al reintentar con el mismo identificador se genera de verdad (el fallo no se cacheó)
    assert servicio.crear(solicitud(cantidad=5))["prueba"]["total"] == 5


def test_la_misma_solicitud_repetida_no_vuelve_a_generar(servicio, ia):
    primera = servicio.crear(solicitud(cantidad=10, id_solicitud="mismo-intento"))
    llamadas = len(ia.llamadas)
    segunda = servicio.crear(solicitud(cantidad=10, id_solicitud="mismo-intento"))
    assert segunda == primera and len(ia.llamadas) == llamadas


def test_solicitudes_simultaneas_con_el_mismo_id_generan_una_sola_vez(servicio, ia):
    resultados = []
    hilos = [threading.Thread(target=lambda: resultados.append(servicio.crear(solicitud(cantidad=5, id_solicitud="carrera-0001")))) for _ in range(4)]
    [h.start() for h in hilos]
    [h.join() for h in hilos]
    assert len(resultados) == 4 and all(r == resultados[0] for r in resultados)
    assert len(ia.llamadas) == 1


# ------------------------------------------------------------------ Seguridad de la clave


def test_el_sello_es_opaco_y_la_vista_publica_no_filtra_la_clave(servicio):
    creada, iniciada = crear_e_iniciar(servicio, cantidad=5)
    estado = servicio._sellador.abrir(creada["sello"])
    secretos = [p["explicacion"] for p in estado["preguntas"]] + [p["fundamento"] for p in estado["preguntas"]]
    publico = json.dumps(iniciada, ensure_ascii=False) + creada["sello"]
    for secreto in secretos:
        assert secreto not in publico
    for pregunta in iniciada["prueba"]["preguntas"]:
        assert not {"correcta", "explicacion", "fundamento", "conceptos"} & pregunta.keys()


@pytest.mark.parametrize("sello", ["x" * 40, "gAAAAA" + "A" * 60, ""])
def test_sellos_falsos_o_corruptos_se_rechazan(servicio, sello):
    with pytest.raises(PruebaInvalida):
        servicio.iniciar(sello)


def test_un_sello_alterado_o_de_otra_clave_se_rechaza(servicio, ia, reloj):
    creada = servicio.crear(solicitud(cantidad=5))
    alterado = creada["sello"][:-6] + ("AAAAAA" if creada["sello"][-6:] != "AAAAAA" else "BBBBBB")
    with pytest.raises(PruebaInvalida):
        servicio.iniciar(alterado)
    ajeno = ServicioPruebas(ia, Sellador("otra-clave"), ahora=reloj)
    with pytest.raises(PruebaInvalida):
        ajeno.iniciar(creada["sello"])


def test_sin_modo_asistido_no_se_envian_terminos_y_con_modo_si(servicio):
    _, sin = crear_e_iniciar(servicio, cantidad=5, asistido=False, id_solicitud="sin-asistido")
    assert all(p["terminos"] == [] for p in sin["prueba"]["preguntas"])
    _, con = crear_e_iniciar(servicio, cantidad=5, asistido=True, id_solicitud="con-asistido")
    for p in con["prueba"]["preguntas"]:
        assert p["terminos"]
        for t in p["terminos"]:
            assert 0 <= t["inicio"] < t["fin"] <= len(p["enunciado"]) and t["definicion"]


# ------------------------------------------------------------------ Reloj, pausa y entrega


def test_el_reloj_empieza_al_iniciar_no_al_crear(servicio, reloj):
    creada = servicio.crear(solicitud(minutos=10))
    reloj.avanzar(120)  # el estudiante tarda en pulsar «Comenzar»
    iniciada = servicio.iniciar(creada["sello"])
    assert iniciada["tiempo"]["restante_segundos"] == 600
    reloj.avanzar(90)
    assert servicio.estado(iniciada["sello"])["tiempo"]["restante_segundos"] == 510


def test_recargar_no_reinicia_el_cronometro_ni_regenera_preguntas(servicio, reloj, ia):
    _, iniciada = crear_e_iniciar(servicio, cantidad=5, minutos=10)
    llamadas = len(ia.llamadas)
    reloj.avanzar(100)
    recuperada = servicio.estado(iniciada["sello"])
    assert recuperada["tiempo"]["restante_segundos"] == 500
    assert recuperada["prueba"]["preguntas"] == iniciada["prueba"]["preguntas"]
    assert len(ia.llamadas) == llamadas


def test_iniciar_dos_veces_no_reinicia_el_reloj(servicio, reloj):
    creada = servicio.crear(solicitud(minutos=10))
    primera = servicio.iniciar(creada["sello"])
    reloj.avanzar(60)
    segunda = servicio.iniciar(primera["sello"])
    assert segunda["tiempo"]["restante_segundos"] == 540


def test_la_pausa_oculta_las_preguntas_y_congela_el_tiempo(servicio, reloj):
    _, iniciada = crear_e_iniciar(servicio, minutos=10, cantidad=5)
    reloj.avanzar(60)
    pausada = servicio.pausar(iniciada["sello"], {}, {})
    assert pausada["prueba"]["estado"] == "pausada"
    assert pausada["prueba"]["preguntas"] is None  # no viajan en la respuesta
    reloj.avanzar(3600)  # una hora de pausa
    assert servicio.estado(pausada["sello"])["prueba"]["preguntas"] is None
    assert servicio.estado(pausada["sello"])["tiempo"]["restante_segundos"] == 540
    reanudada = servicio.reanudar(pausada["sello"])
    assert reanudada["tiempo"]["restante_segundos"] == 540
    assert reanudada["prueba"]["preguntas"] and reanudada["prueba"]["estado"] == "en_curso"
    reloj.avanzar(40)
    assert servicio.estado(reanudada["sello"])["tiempo"]["restante_segundos"] == 500


def test_varias_pausas_se_acumulan_sin_descontar_tiempo(servicio, reloj):
    _, iniciada = crear_e_iniciar(servicio, minutos=10, cantidad=5)
    sello = iniciada["sello"]
    for _ in range(3):
        reloj.avanzar(10)
        sello = servicio.pausar(sello, {}, {})["sello"]
        reloj.avanzar(500)
        sello = servicio.reanudar(sello)["sello"]
    assert servicio.estado(sello)["tiempo"]["restante_segundos"] == 570


def test_pausar_con_la_pausa_deshabilitada_se_rechaza(servicio):
    _, iniciada = crear_e_iniciar(servicio, pausa=False, cantidad=5)
    with pytest.raises(PausaNoPermitida):
        servicio.pausar(iniciada["sello"], {}, {})


def test_no_se_puede_pausar_si_el_tiempo_ya_se_agoto(servicio, reloj):
    _, iniciada = crear_e_iniciar(servicio, minutos=5, cantidad=5)
    reloj.avanzar(301)
    with pytest.raises(EstadoPruebaInvalido):
        servicio.pausar(iniciada["sello"], {}, {})


def test_sin_limite_no_hay_vencimiento(servicio, reloj):
    _, iniciada = crear_e_iniciar(servicio, minutos=None, cantidad=5)
    reloj.avanzar(10 * 3600)
    estado = servicio.estado(iniciada["sello"])
    assert estado["tiempo"]["restante_segundos"] is None and estado["tiempo"]["vencida"] is False
    assert estado["prueba"]["preguntas"]


def test_con_tiempo_agotado_no_se_entregan_las_preguntas(servicio, reloj):
    _, iniciada = crear_e_iniciar(servicio, minutos=5, cantidad=5)
    reloj.avanzar(400)
    recuperada = servicio.estado(iniciada["sello"])
    assert recuperada["tiempo"]["vencida"] is True and recuperada["prueba"]["preguntas"] is None


def test_un_sello_muy_antiguo_caduca(servicio, reloj):
    creada = servicio.crear(solicitud())
    reloj.avanzar(sesion.CADUCIDAD_SEGUNDOS + 1)
    with pytest.raises(PruebaExpirada):
        servicio.iniciar(creada["sello"])


def respuestas_correctas(servicio, sello, cuantas=None):
    estado = servicio._sellador.abrir(sello)
    elegidas = estado["preguntas"] if cuantas is None else estado["preguntas"][:cuantas]
    return {p["id"]: p["correcta"] for p in elegidas}


def respuesta_incorrecta(estado, id_pregunta):
    pregunta = next(p for p in estado["preguntas"] if p["id"] == id_pregunta)
    return next(o["id"] for o in pregunta["opciones"] if o["id"] != pregunta["correcta"])


def test_sincronizar_guarda_respuestas_y_permite_recuperarlas(servicio, reloj):
    _, iniciada = crear_e_iniciar(servicio, cantidad=5)
    respuestas = respuestas_correctas(servicio, iniciada["sello"], 2)
    ids = list(respuestas)
    descartes = {ids[0]: [o["id"] for o in iniciada["prueba"]["preguntas"][0]["opciones"] if o["id"] != respuestas[ids[0]]][:2]}
    guardada = servicio.sincronizar(iniciada["sello"], respuestas, descartes)
    recuperada = servicio.estado(guardada["sello"])
    assert recuperada["prueba"]["respuestas"] == respuestas
    assert recuperada["prueba"]["descartes"] == descartes


def test_se_ignoran_ids_inventados_y_un_descarte_no_puede_ser_la_respuesta_elegida(servicio):
    _, iniciada = crear_e_iniciar(servicio, cantidad=5)
    primera = iniciada["prueba"]["preguntas"][0]
    guardada = servicio.sincronizar(
        iniciada["sello"],
        {primera["id"]: "a", "p99": "a", primera["id"] + "x": "a"},
        {primera["id"]: ["a", "b", "zz", "b"], "p99": ["a"]},
    )
    prueba = servicio.estado(guardada["sello"])["prueba"]
    assert prueba["respuestas"] == {primera["id"]: "a"}
    assert prueba["descartes"] == {primera["id"]: ["b"]}


def test_nunca_se_pueden_descartar_las_cuatro_alternativas(servicio):
    _, iniciada = crear_e_iniciar(servicio, cantidad=5)
    p = iniciada["prueba"]["preguntas"][0]
    guardada = servicio.sincronizar(iniciada["sello"], {}, {p["id"]: ["a", "b", "c", "d"]})
    assert len(servicio.estado(guardada["sello"])["prueba"]["descartes"][p["id"]]) == 3


def test_finalizar_califica_en_el_servidor(servicio, reloj):
    creada, iniciada = crear_e_iniciar(servicio, cantidad=10, dificultad="media", minutos=15)
    estado = servicio._sellador.abrir(creada["sello"])
    respuestas = respuestas_correctas(servicio, creada["sello"], 6)  # 6 correctas
    mala = estado["preguntas"][6]["id"]
    respuestas[mala] = respuesta_incorrecta(estado, mala)  # 1 incorrecta; 3 omitidas
    reloj.avanzar(125)
    final = servicio.finalizar(iniciada["sello"], respuestas, {})
    r = final["resultado"]
    assert (r["correctas"], r["incorrectas"], r["omitidas"], r["total_preguntas"]) == (6, 1, 3, 10)
    assert r["duracion_segundos"] == 125 and r["tiempo_agotado"] is False
    por_estado = {x["estado"] for x in final["revision"]}
    assert por_estado == {"correcta", "incorrecta", "omitida"}
    esperados = sum({"facil": 0.5, "media": 1, "dificil": 2}[p["dificultad"]] for p in estado["preguntas"] if respuestas.get(p["id"]) == p["correcta"])
    assert r["puntaje"] == esperados
    assert r["puntaje_maximo"] == sum({"facil": 0.5, "media": 1, "dificil": 2}[p["dificultad"]] for p in estado["preguntas"])
    assert r["porcentaje"] == round(esperados / r["puntaje_maximo"] * 100)
    # La revisión sí revela la clave y la explicación (la prueba ya terminó).
    assert all(x["id_correcta"] and x["explicacion"] and x["fundamento"] for x in final["revision"])
    suma = sum(b["total"] for b in r["por_dificultad"].values())
    assert suma == 10


def test_los_descartes_no_afectan_la_calificacion(servicio):
    creada, iniciada = crear_e_iniciar(servicio, cantidad=5)
    respuestas = respuestas_correctas(servicio, creada["sello"])
    sin = servicio.finalizar(iniciada["sello"], respuestas, {})["resultado"]["puntaje"]

    otra, otra_iniciada = crear_e_iniciar(servicio, cantidad=5, id_solicitud="otro-intento-1")
    estado = servicio._sellador.abrir(otra["sello"])
    # Descartar la alternativa correcta sin elegirla tampoco la penaliza ni la premia.
    descartes = {p["id"]: [p["correcta"]] for p in estado["preguntas"]}
    con = servicio.finalizar(otra_iniciada["sello"], {}, descartes)["resultado"]
    assert sin > 0 and con["puntaje"] == 0 and con["omitidas"] == 5


def test_el_puntaje_no_se_toma_del_navegador(servicio):
    creada, iniciada = crear_e_iniciar(servicio, cantidad=5)
    final = servicio.finalizar(iniciada["sello"], {"p01": "z", "puntaje": "100"}, {})  # type: ignore[dict-item]
    assert final["resultado"]["correctas"] == 0 and final["resultado"]["omitidas"] == 5


def test_se_agota_el_tiempo_y_se_conservan_solo_las_respuestas_guardadas_antes(servicio, reloj):
    creada, iniciada = crear_e_iniciar(servicio, cantidad=5, minutos=5)
    todas = respuestas_correctas(servicio, creada["sello"])
    dos = dict(list(todas.items())[:2])
    guardada = servicio.sincronizar(iniciada["sello"], dos, {})
    reloj.avanzar(600)  # el estudiante dejó pasar el tiempo (o manipuló su reloj) y manda más respuestas tarde
    final = servicio.finalizar(guardada["sello"], todas, {})
    r = final["resultado"]
    assert r["tiempo_agotado"] is True
    assert r["correctas"] == 2 and r["omitidas"] == 3
    assert r["duracion_segundos"] == 300  # nunca más que el límite


def test_la_entrega_automatica_justo_al_agotarse_acepta_las_ultimas_respuestas(servicio, reloj):
    creada, iniciada = crear_e_iniciar(servicio, cantidad=5, minutos=5)
    todas = respuestas_correctas(servicio, creada["sello"])
    reloj.avanzar(302)  # 2 s de latencia dentro de la gracia
    final = servicio.finalizar(iniciada["sello"], todas, {})
    assert final["resultado"]["tiempo_agotado"] is True and final["resultado"]["correctas"] == 5


def test_no_se_pueden_guardar_respuestas_pasada_la_gracia(servicio, reloj):
    creada, iniciada = crear_e_iniciar(servicio, cantidad=5, minutos=5)
    reloj.avanzar(400)
    guardada = servicio.sincronizar(iniciada["sello"], respuestas_correctas(servicio, creada["sello"]), {})
    assert guardada["tiempo"]["vencida"] is True
    assert servicio._sellador.abrir(guardada["sello"])["respuestas"] == {}


def test_no_se_puede_responder_mientras_esta_pausada(servicio, reloj):
    creada, iniciada = crear_e_iniciar(servicio, cantidad=5)
    pausada = servicio.pausar(iniciada["sello"], {}, {})
    ignorada = servicio.sincronizar(pausada["sello"], respuestas_correctas(servicio, creada["sello"]), {})
    assert servicio._sellador.abrir(ignorada["sello"])["respuestas"] == {}


def test_finalizar_estando_pausada_no_cuenta_el_tiempo_de_pausa(servicio, reloj):
    _, iniciada = crear_e_iniciar(servicio, cantidad=5, minutos=10)
    reloj.avanzar(100)
    pausada = servicio.pausar(iniciada["sello"], {}, {})
    reloj.avanzar(5000)
    final = servicio.finalizar(pausada["sello"], {}, {})
    assert final["resultado"]["duracion_segundos"] == 100 and final["resultado"]["tiempo_agotado"] is False


def test_no_se_puede_finalizar_una_prueba_que_no_se_inicio(servicio):
    creada = servicio.crear(solicitud(cantidad=5))
    with pytest.raises(EstadoPruebaInvalido):
        servicio.finalizar(creada["sello"], {}, {})


def test_finalizar_dos_veces_devuelve_la_misma_calificacion(servicio, reloj):
    creada, iniciada = crear_e_iniciar(servicio, cantidad=5)
    todas = respuestas_correctas(servicio, creada["sello"])
    primera = servicio.finalizar(iniciada["sello"], todas, {})
    # Reenvío con el sello original y respuestas distintas: gana la primera calificación.
    segunda = servicio.finalizar(iniciada["sello"], {}, {})
    assert segunda == primera
    # Con el sello ya finalizado (recarga de la pantalla de resultados) también.
    tercera = servicio.finalizar(primera["sello"], {}, {})
    assert tercera["resultado"] == primera["resultado"]


def test_un_sello_finalizado_se_recalcula_igual_aunque_el_servidor_se_haya_reiniciado(servicio, ia, reloj):
    creada, iniciada = crear_e_iniciar(servicio, cantidad=5)
    primera = servicio.finalizar(iniciada["sello"], respuestas_correctas(servicio, creada["sello"]), {})
    reiniciado = ServicioPruebas(ia, Sellador("clave-de-pruebas"), ahora=reloj)
    assert reiniciado.finalizar(primera["sello"], {}, {})["resultado"] == primera["resultado"]


def test_conceptos_debiles_se_calculan_con_lo_fallado(servicio):
    creada, iniciada = crear_e_iniciar(servicio, cantidad=5)
    final = servicio.finalizar(iniciada["sello"], {}, {})
    debiles = final["resultado"]["conceptos_debiles"]
    assert 1 <= len(debiles) <= 3 and all(d["falladas"] == d["total"] == 1 for d in debiles)


# ------------------------------------------------------------------ MOD-07: dificultad adaptativa


def test_dificultad_adaptativa_reparte_por_nivel_y_lo_envia_a_la_ia(servicio, ia):
    entrada = solicitud(cantidad=10, dificultad="adaptativa")
    entrada.configuracion.nivel_estudiante = 0.85
    creada = servicio.crear(entrada)
    assert creada["prueba"]["distribucion"] == {"facil": 0, "media": 2, "dificil": 8}
    assert ia.llamadas and all("nivel estimado 0.85" in llamada["entrada"] for llamada in ia.llamadas)


def test_dificultad_adaptativa_sin_nivel_se_rechaza(servicio):
    with pytest.raises(ConfiguracionPruebaInvalida):
        servicio.crear(solicitud(dificultad="adaptativa"))