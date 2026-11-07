"""Servicio de preguntas de práctica (MOD-03) con el proveedor de IA falso."""
import pytest

from app.comun.errores import IATiempoAgotado
from app.preguntas.esquemas import SolicitudGenerarPreguntas
from app.preguntas.servicio_preguntas import ServicioPreguntas
from app.pruebas.errores import ContenidoInsuficiente, GeneracionIncompleta
from pruebas.ia_pruebas_falsa import IAGeneradora, resumen_de_ejemplo


def _solicitud(**extra) -> SolicitudGenerarPreguntas:
    datos = {"id_tema": "t1", "titulo_tema": "Ondas", "resumen": resumen_de_ejemplo(30), "cantidad": 10, "dificultad": "media"}
    datos.update(extra)
    return SolicitudGenerarPreguntas.model_validate(datos)


def test_genera_la_cantidad_pedida_con_la_distribucion_de_la_dificultad():
    resultado = ServicioPreguntas(IAGeneradora()).generar(_solicitud())
    assert len(resultado["preguntas"]) == 10
    assert resultado["distribucion"] == {"facil": 2, "media": 6, "dificil": 2}
    for nivel, cantidad in resultado["distribucion"].items():
        assert sum(1 for p in resultado["preguntas"] if p["dificultad"] == nivel) == cantidad


def test_cada_pregunta_trae_cuatro_opciones_y_una_correcta_valida():
    for p in ServicioPreguntas(IAGeneradora()).generar(_solicitud())["preguntas"]:
        ids = [o["id"] for o in p["opciones"]]
        assert ids == ["a", "b", "c", "d"] and p["correcta"] in ids
        assert p["explicacion"] and p["fundamento"]


def test_pide_las_que_faltan_si_la_primera_respuesta_se_queda_corta():
    ia = IAGeneradora(de_menos=2)
    assert len(ServicioPreguntas(ia).generar(_solicitud())["preguntas"]) == 10
    assert len(ia.llamadas) == 2


def test_envia_el_nivel_del_estudiante_y_los_enunciados_a_evitar():
    ia = IAGeneradora()
    ServicioPreguntas(ia).generar(_solicitud(nivel_estudiante=0.3, evitar=["¿Pregunta ya vista sobre ondas?"]))
    entrada = ia.llamadas[0]["entrada"]
    assert "nivel estimado 0.30" in entrada and "Pregunta ya vista" in entrada


def test_resumen_demasiado_breve_se_rechaza():
    with pytest.raises(ContenidoInsuficiente):
        ServicioPreguntas(IAGeneradora()).generar(_solicitud(resumen=resumen_de_ejemplo(2), cantidad=10))


def test_si_la_ia_siempre_devuelve_mala_calidad_la_generacion_falla():
    with pytest.raises(GeneracionIncompleta):
        ServicioPreguntas(IAGeneradora(mala_calidad=True)).generar(_solicitud())


def test_los_errores_del_proveedor_se_propagan():
    with pytest.raises(IATiempoAgotado):
        ServicioPreguntas(IAGeneradora(error=IATiempoAgotado())).generar(_solicitud())


def test_el_id_de_la_pregunta_es_estable_para_el_mismo_enunciado():
    a = ServicioPreguntas(IAGeneradora()).generar(_solicitud())["preguntas"]
    b = ServicioPreguntas(IAGeneradora()).generar(_solicitud())["preguntas"]
    assert {p["id"] for p in a} == {p["id"] for p in b}