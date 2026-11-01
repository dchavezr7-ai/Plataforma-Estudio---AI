"""Cuerpos de solicitud de la API de pruebas (solo Pydantic, sin FastAPI).

Los límites son técnicos (evitan cuerpos gigantes); las reglas funcionales las valida el servicio.
"""
from typing import Literal

from pydantic import BaseModel, Field

LIMITE_CAMPO = 60_000


class TablaFuente(BaseModel):
    titulo: str = Field(default="", max_length=500)
    encabezados: list[str] = Field(default_factory=list, max_length=20)
    filas: list[list[str]] = Field(default_factory=list, max_length=500)


class SeccionFuente(BaseModel):
    titulo: str = Field(default="", max_length=500)
    contenido: str = Field(default="", max_length=LIMITE_CAMPO)
    puntos: list[str] = Field(default_factory=list, max_length=200)
    tabla: TablaFuente | None = None


class ResumenFuente(BaseModel):
    """Resumen general del tema tal como lo muestra el módulo Resúmenes."""

    titulo: str = Field(default="", max_length=500)
    introduccion: str = Field(default="", max_length=LIMITE_CAMPO)
    secciones: list[SeccionFuente] = Field(default_factory=list, max_length=200)


class DistribucionEntrada(BaseModel):
    facil: int = Field(default=0, ge=0, le=100)
    media: int = Field(default=0, ge=0, le=100)
    dificil: int = Field(default=0, ge=0, le=100)


class ConfiguracionEntrada(BaseModel):
    cantidad_preguntas: int = Field(ge=1, le=100)
    dificultad: Literal["facil", "media", "dificil", "personalizada", "adaptativa"]
    distribucion_personalizada: DistribucionEntrada | None = None
    limite_minutos: int | None = Field(default=None, ge=1, le=240)
    modo_asistido: bool = False
    pausa_blindada: bool = False
    cronometro_visible: bool = True
    # MOD-07: nivel estimado del estudiante en el tema (0 a 1). Obligatorio con dificultad «adaptativa».
    nivel_estudiante: float | None = Field(default=None, ge=0, le=1)



class SolicitudCrear(BaseModel):
    # Identifica el intento: si la red repite la solicitud, no se vuelve a generar ni a cobrar.
    id_solicitud: str = Field(min_length=8, max_length=64)
    id_tema: str = Field(min_length=1, max_length=100)
    titulo_tema: str = Field(default="", max_length=300)
    resumen: ResumenFuente
    configuracion: ConfiguracionEntrada


class SolicitudSello(BaseModel):
    sello: str = Field(min_length=20, max_length=500_000)


class SolicitudProgreso(SolicitudSello):
    """Respuestas y descartes actuales del estudiante: `{id_pregunta: id_opcion}` y `{id_pregunta: [id_opcion]}`."""

    respuestas: dict[str, str] = Field(default_factory=dict, max_length=100)
    descartes: dict[str, list[str]] = Field(default_factory=dict, max_length=100)
