"""API HTTP de preguntas de práctica con el proveedor de IA sustituido por uno falso."""
import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")

from fastapi.testclient import TestClient  # noqa: E402

from app.comun.errores import IATiempoAgotado  # noqa: E402
from app.configuracion.ajustes import Ajustes, obtener_ajustes  # noqa: E402
from app.main import crear_aplicacion  # noqa: E402
from app.resumenes.dependencias import obtener_proveedor_ia  # noqa: E402
from pruebas.ia_pruebas_falsa import IAGeneradora, resumen_de_ejemplo  # noqa: E402

AJUSTES = Ajustes(
    openai_api_key="clave-falsa",
    openai_model="modelo-de-prueba",
    openai_timeout_segundos=5,
    openai_max_reintentos=0,
    resumen_min_caracteres=100,
    resumen_max_caracteres=20_000,
    pdf_max_bytes=1024 * 1024,
    pdf_max_paginas=10,
    origenes_permitidos=("http://localhost:5173",),
    pruebas_clave_secreta="clave-de-la-api-de-pruebas",
)


def _cliente(proveedor) -> TestClient:
    aplicacion = crear_aplicacion()
    aplicacion.dependency_overrides[obtener_ajustes] = lambda: AJUSTES
    aplicacion.dependency_overrides[obtener_proveedor_ia] = lambda: proveedor
    return TestClient(aplicacion, raise_server_exceptions=False)


def _cuerpo(**cambios) -> dict:
    cuerpo = {
        "id_tema": "tema-1",
        "titulo_tema": "Ondas",
        "resumen": resumen_de_ejemplo().model_dump(),
        "cantidad": 5,
        "dificultad": "media",
        "nivel_estudiante": None,
        "evitar": [],
    }
    cuerpo.update(cambios)
    return cuerpo


def test_generar_devuelve_las_preguntas_pedidas():
    respuesta = _cliente(IAGeneradora()).post("/api/preguntas/generar", json=_cuerpo())
    assert respuesta.status_code == 200
    datos = respuesta.json()["datos"]
    assert respuesta.json()["exito"] is True and datos["id_tema"] == "tema-1"
    assert len(datos["preguntas"]) == 5
    for p in datos["preguntas"]:
        assert len(p["opciones"]) == 4 and p["correcta"] in {o["id"] for o in p["opciones"]}


def test_cantidad_fuera_de_rango_responde_solicitud_invalida():
    respuesta = _cliente(IAGeneradora()).post("/api/preguntas/generar", json=_cuerpo(cantidad=0))
    assert respuesta.status_code == 422 and respuesta.json()["error"]["codigo"] == "SOLICITUD_INVALIDA"


def test_resumen_breve_responde_contenido_insuficiente():
    resumen = resumen_de_ejemplo().model_dump()
    resumen["secciones"] = resumen["secciones"][:1]
    respuesta = _cliente(IAGeneradora()).post("/api/preguntas/generar", json=_cuerpo(resumen=resumen, cantidad=25))
    assert respuesta.status_code == 422 and respuesta.json()["error"]["codigo"] == "PRUEBA_CONTENIDO_INSUFICIENTE"


def test_error_de_openai_usa_su_estado_y_no_filtra_detalles():
    respuesta = _cliente(IAGeneradora(error=IATiempoAgotado())).post("/api/preguntas/generar", json=_cuerpo())
    assert respuesta.status_code == 504 and respuesta.json()["error"]["codigo"] == "IA_TIEMPO_AGOTADO"