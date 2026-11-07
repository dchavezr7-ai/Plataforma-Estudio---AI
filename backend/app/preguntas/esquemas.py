"""Cuerpos de solicitud del módulo de preguntas de práctica (solo Pydantic, sin FastAPI)."""
from typing import Literal

from pydantic import BaseModel, Field

from app.pruebas.esquemas import ResumenFuente

MAXIMO_PREGUNTAS_PRACTICA = 25


class SolicitudGenerarPreguntas(BaseModel):
    id_tema: str = Field(min_length=1, max_length=100)
    titulo_tema: str = Field(default="", max_length=300)
    resumen: ResumenFuente
    cantidad: int = Field(default=10, ge=1, le=MAXIMO_PREGUNTAS_PRACTICA)
    # Dificultad dominante (perfil 75/20/5, 20/60/20 o 5/20/75). MOD-07 enviará aquí la dificultad objetivo.
    dificultad: Literal["facil", "media", "dificil"] = "media"
    # Opcional (MOD-07): nivel estimado 0-1; solo calibra la exigencia dentro de cada dificultad.
    nivel_estudiante: float | None = Field(default=None, ge=0, le=1)
    # Enunciados ya mostrados al estudiante, para no repetirlos al pedir más preguntas.
    evitar: list[str] = Field(default_factory=list, max_length=60)