"""Caso de uso: generar preguntas de práctica con IA a partir del resumen general del tema.

Reutiliza, sin modificarlos, el prompt, el analizador y la distribución del módulo `pruebas`:
el backend nunca confía en la IA y descarta preguntas sin fundamento, ambiguas o duplicadas.
"""
import hashlib
import logging
import random

from app.comun.errores import IARespuestaInvalida
from app.preguntas.esquemas import SolicitudGenerarPreguntas
from app.pruebas.analizador import PreguntaGenerada, analizar_preguntas, es_duplicada
from app.pruebas.distribucion import DIFICULTADES, calcular_distribucion, limite_por_contenido
from app.pruebas.errores import ContenidoInsuficiente, GeneracionIncompleta
from app.pruebas.instrucciones import construir_entrada, instrucciones_sistema
from app.pruebas.texto import Fuente, construir_texto_fuente
from app.servicios_externos.proveedor_ia import ProveedorIA

logger = logging.getLogger(__name__)

LETRAS = "abcd"
MAXIMO_RONDAS = 3


class ServicioPreguntas:
    def __init__(self, proveedor: ProveedorIA, *, timeout_ia_segundos: float | None = None, aleatorio: random.Random | None = None):
        self._proveedor = proveedor
        self._timeout = timeout_ia_segundos
        self._azar = aleatorio or random.SystemRandom()

    def generar(self, solicitud: SolicitudGenerarPreguntas) -> dict:
        texto = construir_texto_fuente(solicitud.resumen)
        fuente = Fuente(texto)
        if limite_por_contenido(fuente.caracteres) < solicitud.cantidad:
            raise ContenidoInsuficiente(
                "El resumen de este tema es demasiado breve para esa cantidad de preguntas. Pide menos preguntas o amplía el material."
            )
        objetivo = calcular_distribucion(solicitud.cantidad, solicitud.dificultad)
        aceptadas = self._generar(texto, fuente, solicitud, objetivo)
        return {
            "id_tema": solicitud.id_tema,
            "dificultad": solicitud.dificultad,
            "distribucion": objetivo,
            "modelo": self._proveedor.modelo,
            "huella_fuente": fuente.huella,
            "preguntas": self._preparar(aceptadas),
        }

    def _generar(self, texto: str, fuente: Fuente, solicitud: SolicitudGenerarPreguntas, objetivo: dict[str, int]) -> list[PreguntaGenerada]:
        aceptadas: list[PreguntaGenerada] = []
        motivos: list[str] = []
        evitar_base = [e for e in solicitud.evitar if e.strip()]

        def faltan() -> dict[str, int]:
            hechas = {n: sum(1 for p in aceptadas if p.dificultad == n) for n in DIFICULTADES}
            return {n: max(0, objetivo[n] - hechas[n]) for n in DIFICULTADES}

        for ronda in range(MAXIMO_RONDAS):
            pendientes = faltan()
            if not any(pendientes.values()):
                break
            # Desde la 2.ª ronda se pide una de más por nivel como margen; el límite recorta el exceso.
            pedidas = pendientes if ronda == 0 else {n: (pendientes[n] + 1 if pendientes[n] else 0) for n in DIFICULTADES}
            try:
                bruto = self._proveedor.generar_json(
                    instrucciones=instrucciones_sistema(False),
                    entrada=construir_entrada(
                        texto,
                        pedidas,
                        titulo_tema=solicitud.titulo_tema,
                        evitar=evitar_base + [p.enunciado for p in aceptadas],
                        nivel_estudiante=solicitud.nivel_estudiante,
                    ),
                    timeout_segundos=self._timeout,
                )
                validas, descartes = analizar_preguntas(bruto, fuente, modo_asistido=False)
            except IARespuestaInvalida as error:
                motivos.append(f"respuesta ilegible: {error.detalle}")
                continue
            motivos.extend(descartes)
            limite = dict(pendientes)
            for pregunta in validas:
                if limite.get(pregunta.dificultad, 0) <= 0:
                    continue
                if es_duplicada(pregunta, aceptadas):
                    motivos.append("duplicada")
                    continue
                aceptadas.append(pregunta)
                limite[pregunta.dificultad] -= 1

        pendientes = faltan()
        if any(pendientes.values()):
            logger.error("Generación de práctica incompleta: faltan %s; descartes: %s", pendientes, sorted(set(motivos)))
            raise GeneracionIncompleta(detalle=f"faltan {pendientes}")
        return aceptadas

    def _preparar(self, generadas: list[PreguntaGenerada]) -> list[dict]:
        """Baraja preguntas y alternativas; el id depende del enunciado, así que es estable entre visitas."""
        orden = list(generadas)
        self._azar.shuffle(orden)
        resultado = []
        for g in orden:
            posiciones = list(range(len(g.opciones)))
            self._azar.shuffle(posiciones)
            resultado.append(
                {
                    "id": "q" + hashlib.sha1(g.enunciado.encode("utf-8")).hexdigest()[:10],
                    "enunciado": g.enunciado,
                    "dificultad": g.dificultad,
                    "opciones": [{"id": LETRAS[n], "texto": g.opciones[o]} for n, o in enumerate(posiciones)],
                    "correcta": LETRAS[posiciones.index(g.indice_correcta)],
                    "explicacion": g.explicacion,
                    "fundamento": g.fundamento,
                    "conceptos": g.conceptos,
                }
            )
        return resultado