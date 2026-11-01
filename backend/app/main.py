import logging

from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as ExcepcionHTTP

from app.adaptacion.enrutador import enrutador as enrutador_adaptacion
from app.comun.errores import ErrorAplicacion
from app.comun.respuestas import respuesta_error
from app.configuracion.ajustes import obtener_ajustes
from app.contenido.enrutador import enrutador as enrutador_contenido
from app.mapas_conceptuales.enrutador import enrutador as enrutador_mapas
from app.pruebas.enrutador import enrutador as enrutador_pruebas
from app.resumenes.enrutador import enrutador as enrutador_resumenes

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)


def _registrar_manejadores_de_errores(aplicacion: FastAPI) -> None:
    @aplicacion.exception_handler(ErrorAplicacion)
    async def _error_controlado(_: Request, error: ErrorAplicacion):
        nivel = logging.ERROR if error.estado_http >= 500 else logging.WARNING
        logger.log(nivel, "%s: %s", error.codigo, error.detalle or error.mensaje)
        return respuesta_error(error.codigo, error.mensaje, error.estado_http)

    @aplicacion.exception_handler(RequestValidationError)
    async def _solicitud_invalida(_: Request, __: RequestValidationError):
        return respuesta_error("SOLICITUD_INVALIDA", "La solicitud no es válida. Revisa los datos enviados.", 422)

    @aplicacion.exception_handler(ExcepcionHTTP)
    async def _error_http(_: Request, error: ExcepcionHTTP):
        mensajes = {404: "El recurso solicitado no existe.", 405: "Método no permitido para este recurso."}
        return respuesta_error("ERROR_HTTP", mensajes.get(error.status_code, "No pudimos completar la solicitud."), error.status_code)


def crear_aplicacion() -> FastAPI:
    ajustes = obtener_ajustes()
    aplicacion = FastAPI(title="Plataforma Estudio AI", version="1.0.0")

    # Captura errores inesperados DENTRO del middleware de CORS: así la respuesta 500
    # también lleva las cabeceras CORS y el navegador puede leer el mensaje.
    @aplicacion.middleware("http")
    async def _capturar_errores_inesperados(solicitud: Request, siguiente):
        try:
            return await siguiente(solicitud)
        except Exception:
            logger.exception("Error interno no controlado en %s %s", solicitud.method, solicitud.url.path)
            return respuesta_error("ERROR_INTERNO", ErrorAplicacion.mensaje_predeterminado, 500)

    aplicacion.add_middleware(
        CORSMiddleware,
        allow_origins=list(ajustes.origenes_permitidos),
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )
    _registrar_manejadores_de_errores(aplicacion)

    aplicacion.include_router(enrutador_resumenes)
    aplicacion.include_router(enrutador_adaptacion)
    aplicacion.include_router(enrutador_contenido)
    aplicacion.include_router(enrutador_mapas)
    aplicacion.include_router(enrutador_pruebas)

    @aplicacion.get("/api/salud", tags=["sistema"])
    def salud(respuesta: Response):
        # Comprobación ligera: no toca OpenAI ni ningún recurso externo. Solo confirma que el
        # servidor HTTP está levantado y la aplicación lista (`ia_configurada` indica si hay
        # clave y modelo definidos, NO que OpenAI esté disponible). Sin caché: el frontend
        # la usa para saber si Render ya despertó.
        respuesta.headers["Cache-Control"] = "no-store"
        return {"estado": "ok", "ia_configurada": ajustes.ia_configurada}

    return aplicacion


app = crear_aplicacion()
