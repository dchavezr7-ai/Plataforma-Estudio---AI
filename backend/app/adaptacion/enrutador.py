"""API del motor adaptativo (MOD-07). Sin base de datos: el cliente guarda el estado y lo reenvía.

    POST /api/adaptacion/registrar   Suma respuestas, cierra periodos de 15 y devuelve nivel y dificultad objetivo
"""
from fastapi import APIRouter

from app.adaptacion import motor
from app.adaptacion.esquemas import SolicitudRegistrar
from app.comun.respuestas import respuesta_exitosa

enrutador = APIRouter(prefix="/api/adaptacion", tags=["adaptacion"])


@enrutador.post("/registrar")
def registrar(solicitud: SolicitudRegistrar):
    estado = solicitud.estado.model_dump() if solicitud.estado else motor.estado_inicial()
    nuevo, cerrados = motor.registrar(estado, [r.model_dump() for r in solicitud.respuestas])
    return respuesta_exitosa(
        {
            "id_tema": solicitud.id_tema,
            "estado": nuevo,
            "periodos_cerrados": cerrados,
            "dificultad_objetivo": motor.dificultad_objetivo(nuevo["nivel"]),
        }
    )