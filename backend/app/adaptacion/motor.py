"""Motor adaptativo (MOD-07): nivel del estudiante por tema y dificultad objetivo. Lógica pura, sin FastAPI ni OpenAI.

Regla de actualización observada en el dataset del modelo (notebook §8, IAML-028):
    nivel_t = 0,75 · nivel_(t−1) + 0,25 · porcentaje_correctas_t
"""
from app.pruebas.distribucion import DIFICULTADES

PREGUNTAS_POR_PERIODO = 15
PESO_NIVEL_PREVIO = 0.75
NIVEL_INICIAL = 0.57  # media de nivel_conocimiento en el periodo 1 del dataset
# Umbrales target → dificultad (TASK-0076). El límite inferior es inclusivo.
UMBRAL_MEDIA = 0.50
UMBRAL_DIFICIL = 0.80


def estado_inicial() -> dict:
    return {"nivel": NIVEL_INICIAL, "numero_periodo": 1, "ultimo_porcentaje": None, "pendientes": []}


def dificultad_objetivo(nivel: float) -> str:
    if nivel >= UMBRAL_DIFICIL:
        return "dificil"
    if nivel >= UMBRAL_MEDIA:
        return "media"
    return "facil"


def actualizar_nivel(nivel_previo: float, porcentaje_correctas: float) -> float:
    nuevo = PESO_NIVEL_PREVIO * nivel_previo + (1 - PESO_NIVEL_PREVIO) * porcentaje_correctas
    return round(min(1.0, max(0.0, nuevo)), 4)


def registrar(estado: dict, respuestas: list[dict]) -> tuple[dict, list[dict]]:
    """Suma respuestas `{dificultad, correcta}` y cierra un periodo cada 15. Devuelve (estado nuevo, periodos cerrados)."""
    nivel = float(estado["nivel"])
    periodo = int(estado["numero_periodo"])
    ultimo = estado.get("ultimo_porcentaje")
    pendientes = list(estado["pendientes"]) + list(respuestas)
    cerrados = []
    while len(pendientes) >= PREGUNTAS_POR_PERIODO:
        bloque, pendientes = pendientes[:PREGUNTAS_POR_PERIODO], pendientes[PREGUNTAS_POR_PERIODO:]
        porcentaje = round(sum(1 for r in bloque if r["correcta"]) / PREGUNTAS_POR_PERIODO, 4)
        nuevo = actualizar_nivel(nivel, porcentaje)
        cerrados.append(
            {
                "numero_periodo": periodo,
                "porcentaje_correctas": porcentaje,
                "variacion_porcentaje": None if ultimo is None else round(porcentaje - ultimo, 4),
                "por_dificultad": _contar(bloque),
                "nivel_previo": nivel,
                "nivel": nuevo,
            }
        )
        nivel, ultimo, periodo = nuevo, porcentaje, periodo + 1
    return {"nivel": nivel, "numero_periodo": periodo, "ultimo_porcentaje": ultimo, "pendientes": pendientes}, cerrados


def _contar(bloque: list[dict]) -> dict:
    conteo = {n: {"preguntas": 0, "correctas": 0} for n in DIFICULTADES}
    for r in bloque:
        conteo[r["dificultad"]]["preguntas"] += 1
        conteo[r["dificultad"]]["correctas"] += int(r["correcta"])
    return conteo 