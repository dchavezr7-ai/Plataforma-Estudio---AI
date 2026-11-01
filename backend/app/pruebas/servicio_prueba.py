"""Casos de uso de las pruebas: crear (con IA), iniciar, pausar, reanudar, guardar progreso y entregar.

Flujo de creación: valida la configuración → arma el texto del resumen general → pide las preguntas a la
IA (en lotes, con reintentos limitados) → valida y deduplica → baraja alternativas → sella el estado.
Nunca entrega una prueba distinta de la pedida: si faltan preguntas válidas, falla con un error claro.
"""
import logging
import math
import random
import threading
import time
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from typing import Callable

from app.adaptacion.motor import dificultad_objetivo
from app.comun.errores import IARespuestaInvalida
from app.pruebas import sesion
from app.pruebas.analizador import PreguntaGenerada, analizar_preguntas, es_duplicada
from app.pruebas.calificacion import calificar
from app.pruebas.distribucion import (
    CANTIDADES_PERMITIDAS,
    DIFICULTADES,
    calcular_distribucion,
    distribucion_vacia,
    limite_por_contenido,
    peso,
    puntaje_maximo,
    resolver_distribucion,
)

from app.pruebas.errores import (
    ConfiguracionPruebaInvalida,
    ContenidoInsuficiente,
    EstadoPruebaInvalido,
    GeneracionIncompleta,
    PausaNoPermitida,
)
from app.pruebas.esquemas import ConfiguracionEntrada, SolicitudCrear
from app.pruebas.instrucciones import construir_entrada, instrucciones_sistema
from app.pruebas.sello import Sellador
from app.pruebas.texto import Fuente, construir_texto_fuente, titulos_de_secciones
from app.servicios_externos.proveedor_ia import ProveedorIA

logger = logging.getLogger(__name__)

LETRAS = "abcd"
MINIMO_PREGUNTAS = min(CANTIDADES_PERMITIDAS)


class CacheIdempotente:
    """Evita repetir (y cobrar) una generación cuando la red repite la misma solicitud.

    Es una ayuda dentro de un único proceso: si el servidor se reinicia, la repetición generaría de nuevo.
    """

    def __init__(self, *, ttl_segundos: float = 900.0, maximo: int = 128, reloj: Callable[[], float] = time.monotonic):
        self._ttl, self._maximo, self._reloj = ttl_segundos, maximo, reloj
        self._global = threading.Lock()
        self._candados: dict[str, threading.Lock] = {}
        self._resultados: OrderedDict[str, tuple[float, dict]] = OrderedDict()

    def ejecutar(self, clave: str, funcion: Callable[[], dict]) -> dict:
        with self._global:
            self._purgar()
            candado = self._candados.setdefault(clave, threading.Lock())
        with candado:
            with self._global:
                existente = self._resultados.get(clave)
            if existente:
                return existente[1]
            valor = funcion()  # un fallo no se guarda: el reintento vuelve a intentarlo
            with self._global:
                self._resultados[clave] = (self._reloj(), valor)
            return valor

    def _purgar(self) -> None:
        ahora = self._reloj()
        for clave in [k for k, (t, _) in self._resultados.items() if ahora - t > self._ttl]:
            self._resultados.pop(clave, None)
            self._candados.pop(clave, None)
        while len(self._resultados) > self._maximo:
            clave, _ = self._resultados.popitem(last=False)
            self._candados.pop(clave, None)


class ServicioPruebas:
    def __init__(
        self,
        proveedor: ProveedorIA,
        sellador: Sellador,
        *,
        ahora: Callable[[], float] = time.time,
        timeout_ia_segundos: float = 120.0,
        maximo_rondas: int = 3,
        tamano_lote: int = 10,
        trabajadores: int = 3,
        aleatorio: random.Random | None = None,
        cache: CacheIdempotente | None = None,
    ):
        self._proveedor = proveedor
        self._sellador = sellador
        self._ahora = ahora
        self._timeout = timeout_ia_segundos
        self._rondas = maximo_rondas
        self._lote = tamano_lote
        self._trabajadores = trabajadores
        self._azar = aleatorio or random.SystemRandom()
        self._cache = cache or CacheIdempotente()
        self._finalizadas: OrderedDict[str, dict] = OrderedDict()
        self._candado_finalizadas = threading.Lock()

    # ------------------------------------------------------------------ Crear

    def crear(self, solicitud: SolicitudCrear) -> dict:
        return self._cache.ejecutar(solicitud.id_solicitud, lambda: self._crear(solicitud))

    def _crear(self, solicitud: SolicitudCrear) -> dict:
        config = self._validar_configuracion(solicitud.configuracion)
        texto = construir_texto_fuente(solicitud.resumen)
        fuente = Fuente(texto)
        capacidad = limite_por_contenido(fuente.caracteres)
        if capacidad < MINIMO_PREGUNTAS:
            raise ContenidoInsuficiente(
                "El resumen de este tema es demasiado breve para generar una prueba. Amplía el material y genera el resumen de nuevo.",
                detalle=f"{fuente.caracteres} caracteres",
            )
        if config["cantidad"] > capacidad:
            raise ContenidoInsuficiente(
                f"El resumen solo da para unas {capacidad} preguntas de calidad. Elige una cantidad menor.",
                detalle=f"{config['cantidad']} pedidas, capacidad {capacidad}",
            )

        generadas = self._generar(texto, solicitud, config)
        preguntas = self._preparar_preguntas(generadas, config["modo_asistido"])
        ahora = self._ahora()
        estado = sesion.nuevo_estado(
            id_prueba=f"pr_{self._azar.getrandbits(64):016x}",
            ahora=ahora,
            id_tema=solicitud.id_tema,
            titulo_tema=solicitud.titulo_tema,
            huella=fuente.huella,
            modelo=self._proveedor.modelo,
            configuracion=config,
            preguntas=preguntas,
        )
        return {"sello": self._sellador.sellar(estado), "prueba": self._vista(estado, incluir_preguntas=False)}

    def _validar_configuracion(self, entrada: ConfiguracionEntrada) -> dict:
        if entrada.cantidad_preguntas not in CANTIDADES_PERMITIDAS:
            opciones = ", ".join(str(c) for c in CANTIDADES_PERMITIDAS)
            raise ConfiguracionPruebaInvalida(f"La cantidad de preguntas debe ser una de estas: {opciones}.")
        nivel = entrada.nivel_estudiante
        objetivo = None
        if entrada.dificultad == "adaptativa":
            # MOD-07: el reparto por dificultad sale del nivel estimado del estudiante.
            if nivel is None:
                raise ConfiguracionPruebaInvalida("La dificultad adaptativa necesita el nivel estimado del estudiante.")
            objetivo = dificultad_objetivo(nivel)
            distribucion = calcular_distribucion(entrada.cantidad_preguntas, objetivo)
        else:
            personalizada = entrada.distribucion_personalizada.model_dump() if entrada.distribucion_personalizada else None
            distribucion = resolver_distribucion(entrada.cantidad_preguntas, entrada.dificultad, personalizada)
        return {
            "cantidad": entrada.cantidad_preguntas,
            "dificultad": entrada.dificultad,
            "distribucion": distribucion,
            "limite_segundos": None if entrada.limite_minutos is None else entrada.limite_minutos * 60,
            "modo_asistido": entrada.modo_asistido,
            "pausa_blindada": entrada.pausa_blindada,
            "cronometro_visible": entrada.cronometro_visible,
            "nivel_estudiante": nivel,
            "dificultad_objetivo": objetivo,
        }        
    
    # ------------------------------------------------------------ Generación con IA

    def _generar(self, texto: str, solicitud: SolicitudCrear, config: dict) -> list[PreguntaGenerada]:
        fuente = Fuente(texto)
        objetivo: dict[str, int] = config["distribucion"]
        asistido = config["modo_asistido"]
        titulos = titulos_de_secciones(solicitud.resumen)
        aceptadas: list[PreguntaGenerada] = []
        motivos: list[str] = []

        def faltan() -> dict[str, int]:
            hechas = {n: sum(1 for p in aceptadas if p.dificultad == n) for n in DIFICULTADES}
            return {n: max(0, objetivo[n] - hechas[n]) for n in DIFICULTADES}

        def pedir(pedidas: dict[str, int], enfoque: list[str]) -> list[PreguntaGenerada]:
            bruto = self._proveedor.generar_json(
                instrucciones=instrucciones_sistema(asistido),
                entrada=construir_entrada(texto, pedidas, titulo_tema=solicitud.titulo_tema, evitar=[p.enunciado for p in aceptadas], enfoque=enfoque, nivel_estudiante=config.get("nivel_estudiante")),
                timeout_segundos=self._timeout,
            )
            validas, descartes = analizar_preguntas(bruto, fuente, modo_asistido=asistido)
            motivos.extend(descartes)
            return validas

        def aceptar(candidatas: list[PreguntaGenerada], limite: dict[str, int]) -> None:
            restantes = dict(limite)
            for pregunta in candidatas:
                if restantes.get(pregunta.dificultad, 0) <= 0:
                    continue
                if es_duplicada(pregunta, aceptadas):
                    motivos.append("duplicada")
                    continue
                aceptadas.append(pregunta)
                restantes[pregunta.dificultad] -= 1

        # Ronda 1: lotes en paralelo (cada uno con un enfoque distinto para repartir la cobertura).
        lotes = self._dividir_en_lotes(objetivo)
        enfoques = self._repartir_secciones(titulos, len(lotes))
        with ThreadPoolExecutor(max_workers=max(1, min(self._trabajadores, len(lotes)))) as pool:
            futuros = [pool.submit(self._intentar, pedir, lote, enfoque, motivos) for lote, enfoque in zip(lotes, enfoques)]
            for futuro, lote in zip(futuros, lotes):
                aceptar(futuro.result(), lote)

        # Rondas siguientes: solo lo que falta, con margen y sin repetir lo ya aceptado.
        for _ in range(self._rondas - 1):
            pendientes = faltan()
            if not any(pendientes.values()):
                break
            pedidas = {n: (pendientes[n] + 1 if pendientes[n] else 0) for n in DIFICULTADES}
            aceptar(self._intentar(pedir, pedidas, [], motivos), pendientes)

        pendientes = faltan()
        if any(pendientes.values()):
            logger.error("Generación incompleta: faltan %s; descartes: %s", pendientes, sorted(set(motivos)))
            raise GeneracionIncompleta(detalle=f"faltan {pendientes}")
        return aceptadas

    @staticmethod
    def _intentar(pedir: Callable, pedidas: dict[str, int], enfoque: list[str], motivos: list[str]) -> list[PreguntaGenerada]:
        """Una llamada a la IA. Una respuesta ilegible cuenta como intento fallido; los demás errores se propagan."""
        try:
            return pedir(pedidas, enfoque)
        except IARespuestaInvalida as error:
            motivos.append(f"respuesta ilegible: {error.detalle}")
            return []

    def _dividir_en_lotes(self, objetivo: dict[str, int]) -> list[dict[str, int]]:
        total = sum(objetivo.values())
        cantidad = max(1, math.ceil(total / self._lote))
        lotes = [distribucion_vacia() for _ in range(cantidad)]
        indice = 0
        for nivel in DIFICULTADES:  # reparte nivel por nivel, rotando entre lotes
            for _ in range(objetivo[nivel]):
                lotes[indice % cantidad][nivel] += 1
                indice += 1
        return [lote for lote in lotes if sum(lote.values())]

    @staticmethod
    def _repartir_secciones(titulos: list[str], lotes: int) -> list[list[str]]:
        if lotes <= 1 or len(titulos) < lotes:
            return [[] for _ in range(lotes)]
        return [titulos[i::lotes] for i in range(lotes)]

    def _preparar_preguntas(self, generadas: list[PreguntaGenerada], modo_asistido: bool) -> list[dict]:
        """Baraja el orden de las preguntas y de las alternativas, y asigna identificadores estables."""
        orden = list(generadas)
        self._azar.shuffle(orden)
        resultado = []
        for numero, g in enumerate(orden, start=1):
            posiciones = list(range(len(g.opciones)))
            self._azar.shuffle(posiciones)
            opciones = [{"id": LETRAS[nueva], "texto": g.opciones[original]} for nueva, original in enumerate(posiciones)]
            correcta = LETRAS[posiciones.index(g.indice_correcta)]
            resultado.append(
                {
                    "id": f"p{numero:02d}",
                    "enunciado": g.enunciado,
                    "opciones": opciones,
                    "dificultad": g.dificultad,
                    "correcta": correcta,
                    "explicacion": g.explicacion,
                    "fundamento": g.fundamento,
                    "conceptos": g.conceptos,
                    "terminos": g.terminos if modo_asistido else [],
                }
            )
        return resultado

    # ------------------------------------------------------------------ Vistas

    def _vista(self, estado: dict, *, incluir_preguntas: bool) -> dict:
        config = estado["config"]
        vista = {
            "id": estado["id"],
            "id_tema": estado["id_tema"],
            "titulo_tema": estado["titulo_tema"],
            "estado": estado["estado"],
            "total": len(estado["preguntas"]),
            "dificultad": config["dificultad"],
            "distribucion": config["distribucion"],
            "limite_segundos": config["limite_segundos"],
            "puntaje_maximo": puntaje_maximo(config["distribucion"]),
            "modo_asistido": config["modo_asistido"],
            "pausa_blindada": config["pausa_blindada"],
            "cronometro_visible": config["cronometro_visible"],
            "modelo": estado["modelo"],
            "respuestas": estado["respuestas"],
            "descartes": estado["descartes"],
            "preguntas": None,
        }
        if incluir_preguntas:
            # Nunca salen la clave, la explicación ni el fundamento.
            vista["preguntas"] = [
                {
                    "id": p["id"],
                    "enunciado": p["enunciado"],
                    "opciones": p["opciones"],
                    "dificultad": p["dificultad"],
                    "puntos": peso(p["dificultad"]),
                    "terminos": p["terminos"] if config["modo_asistido"] else [],
                }
                for p in estado["preguntas"]
            ]
        return vista

    def _respuesta(self, estado: dict, ahora: float, *, incluir_preguntas: bool = False) -> dict:
        mostrar = incluir_preguntas and estado["estado"] == sesion.EN_CURSO and not sesion.esta_vencida(estado, ahora)
        return {
            "sello": self._sellador.sellar(estado),
            "prueba": self._vista(estado, incluir_preguntas=mostrar),
            "tiempo": sesion.descripcion_tiempo(estado, ahora),
        }

    def _abrir(self, sello: str, ahora: float) -> dict:
        estado = self._sellador.abrir(sello)
        sesion.comprobar_vigencia(estado, ahora)
        return estado

    # ------------------------------------------------------------ Ciclo de la prueba

    def estado(self, sello: str) -> dict:
        """Recuperación (p. ej. tras recargar): no cambia nada; devuelve las preguntas solo si la prueba está en curso."""
        ahora = self._ahora()
        return self._respuesta(self._abrir(sello, ahora), ahora, incluir_preguntas=True)

    def iniciar(self, sello: str) -> dict:
        ahora = self._ahora()
        estado = self._abrir(sello, ahora)
        sesion.iniciar(estado, ahora)
        return self._respuesta(estado, ahora, incluir_preguntas=True)

    def sincronizar(self, sello: str, respuestas: dict, descartes: dict) -> dict:
        ahora = self._ahora()
        estado = self._abrir(sello, ahora)
        self._guardar_progreso(estado, ahora, respuestas, descartes)
        return self._respuesta(estado, ahora)

    def pausar(self, sello: str, respuestas: dict, descartes: dict) -> dict:
        ahora = self._ahora()
        estado = self._abrir(sello, ahora)
        if not estado["config"]["pausa_blindada"]:
            raise PausaNoPermitida()
        self._guardar_progreso(estado, ahora, respuestas, descartes)
        sesion.pausar(estado, ahora)
        return self._respuesta(estado, ahora)  # sin preguntas: la pausa las oculta de verdad

    def reanudar(self, sello: str) -> dict:
        ahora = self._ahora()
        estado = self._abrir(sello, ahora)
        sesion.reanudar(estado, ahora)
        return self._respuesta(estado, ahora, incluir_preguntas=True)

    @staticmethod
    def _guardar_progreso(estado: dict, ahora: float, respuestas: dict, descartes: dict) -> None:
        # Solo se aceptan cambios mientras la prueba corre y queda tiempo (más la gracia de red).
        if estado["estado"] == sesion.EN_CURSO and sesion.dentro_de_gracia(estado, ahora):
            sesion.aplicar_progreso(estado, respuestas, descartes)

    def finalizar(self, sello: str, respuestas: dict, descartes: dict) -> dict:
        ahora = self._ahora()
        estado = self._abrir(sello, ahora)

        with self._candado_finalizadas:
            previa = self._finalizadas.get(estado["id"])
        if previa is not None:  # la primera calificación es la que vale
            return previa

        if estado["estado"] == sesion.FINALIZADA:
            agotado, duracion = estado["tiempo_agotado"], estado["duracion_segundos"] or 0.0
        else:
            if estado["estado"] == sesion.LISTA:
                raise EstadoPruebaInvalido("La prueba todavía no se ha iniciado.", detalle="finalizar en estado lista")
            agotado = sesion.esta_vencida(estado, ahora)
            if sesion.dentro_de_gracia(estado, ahora):
                sesion.aplicar_progreso(estado, respuestas, descartes)
            tope = sesion.limite(estado)
            duracion = sesion.transcurrido(estado, ahora)
            if tope is not None:
                duracion = min(duracion, float(tope))
            sesion.finalizar(estado, ahora)
            estado["tiempo_agotado"], estado["duracion_segundos"] = agotado, duracion

        respuesta = {"sello": self._sellador.sellar(estado), **calificar(estado, tiempo_agotado=agotado, duracion_segundos=duracion)}
        with self._candado_finalizadas:
            self._finalizadas[estado["id"]] = respuesta
            while len(self._finalizadas) > 500:
                self._finalizadas.popitem(last=False)
        return respuesta
