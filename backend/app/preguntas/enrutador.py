"""API de preguntas de práctica (MOD-03).

    POST /api/preguntas/generar   Genera preguntas con IA desde el resumen general → preguntas validadas con su corrección
"""
from fastapi import APIRouter, Depends

from app.comun.respuestas import respuesta_exitosa
from app.preguntas.dependencias import obtener_servicio_preguntas
from app.preguntas.esquemas import SolicitudGenerarPreguntas
from app.preguntas.servicio_preguntas import ServicioPreguntas

enrutador = APIRouter(prefix="/api/preguntas", tags=["preguntas"])


@enrutador.post("/generar")
def generar_preguntas(solicitud: SolicitudGenerarPreguntas, servicio: ServicioPreguntas = Depends(obtener_servicio_preguntas)):
    return respuesta_exitosa(servicio.generar(solicitud))