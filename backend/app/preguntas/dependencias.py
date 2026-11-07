from fastapi import Depends

from app.configuracion.ajustes import Ajustes, obtener_ajustes
from app.preguntas.servicio_preguntas import ServicioPreguntas
from app.resumenes.dependencias import obtener_proveedor_ia
from app.servicios_externos.proveedor_ia import ProveedorIA


def obtener_servicio_preguntas(
    proveedor: ProveedorIA = Depends(obtener_proveedor_ia),
    ajustes: Ajustes = Depends(obtener_ajustes),
) -> ServicioPreguntas:
    return ServicioPreguntas(proveedor, timeout_ia_segundos=ajustes.openai_timeout_pruebas_segundos)