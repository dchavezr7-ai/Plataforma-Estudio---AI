"""Validación de calidad de preguntas con material real y OpenAI real (TASK-0029).

Requiere `backend/.env` con OPENAI_API_KEY y OPENAI_MODEL. Consume créditos de OpenAI.

Uso (desde backend/):
    # 1) Generar lotes (fácil/media/difícil) por material y preparar la revisión manual
    python scripts/validar_preguntas_real.py generar material1.txt material2.json --cantidad 6 --lotes 1

    # 2) Rellenar a mano el campo "revision" de cada pregunta en validacion_preguntas.json
    #    (true/false en: correcta, sin_ambiguedad, dificultad_coherente)

    # 3) Calcular las tasas sobre la muestra revisada
    python scripts/validar_preguntas_real.py calcular validacion_preguntas.json

Material: .txt (UTF-8, se divide en secciones por párrafos) o .json con la forma del campo
"resumen" que envía el frontend (titulo, introduccion, secciones[]).
La corrección y la ambigüedad NO se comprueban automáticamente: este script solo prepara la revisión.
"""
import argparse
import json
import sys
import time
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.configuracion.ajustes import obtener_ajustes  # noqa: E402
from app.preguntas.esquemas import SolicitudGenerarPreguntas  # noqa: E402
from app.preguntas.servicio_preguntas import ServicioPreguntas  # noqa: E402
from app.pruebas.analizador import analizar_preguntas  # noqa: E402
from app.pruebas.esquemas import ResumenFuente  # noqa: E402
from app.pruebas.texto import Fuente, construir_texto_fuente  # noqa: E402
from app.servicios_externos.servicio_openai import ServicioOpenAI  # noqa: E402

DIFICULTADES = ("facil", "media", "dificil")
CAMPOS_REVISION = ("correcta", "sin_ambiguedad", "dificultad_coherente")


class ProveedorRegistrador:
    """Delega en el proveedor real y guarda cada respuesta bruta (una por ronda)."""

    def __init__(self, real):
        self._real = real
        self.brutos: list = []

    def __getattr__(self, nombre):
        return getattr(self._real, nombre)

    def generar_json(self, *args, **kwargs):
        bruto = self._real.generar_json(*args, **kwargs)
        self.brutos.append(bruto)
        return bruto


def cargar_resumen(ruta: Path) -> ResumenFuente:
    if ruta.suffix.lower() == ".json":
        return ResumenFuente.model_validate(json.loads(ruta.read_text(encoding="utf-8")))
    parrafos = [p.strip() for p in ruta.read_text(encoding="utf-8").split("\n\n") if p.strip()]
    secciones = [{"titulo": f"Parte {i}", "contenido": p, "puntos": [], "tabla": None} for i, p in enumerate(parrafos, 1)]
    return ResumenFuente.model_validate({"titulo": ruta.stem, "introduccion": "", "secciones": secciones})


def proveedor_real():
    ajustes = obtener_ajustes()
    if not ajustes.ia_configurada:
        sys.exit("Falta configurar OPENAI_API_KEY y OPENAI_MODEL en backend/.env")
    return ajustes, ServicioOpenAI(
        api_key=ajustes.openai_api_key,
        modelo=ajustes.openai_model,
        timeout_segundos=ajustes.openai_timeout_segundos,
        max_reintentos=ajustes.openai_max_reintentos,
        timeout_pdf_segundos=ajustes.openai_timeout_pdf_segundos,
    )


def generar(args) -> None:
    ajustes, real = proveedor_real()
    lotes, muestra = [], []
    for ruta in args.materiales:
        resumen = cargar_resumen(ruta)
        fuente = Fuente(construir_texto_fuente(resumen))
        for dificultad in DIFICULTADES:
            for n in range(1, args.lotes + 1):
                registrador = ProveedorRegistrador(real)
                servicio = ServicioPreguntas(registrador, timeout_ia_segundos=ajustes.openai_timeout_pruebas_segundos)
                solicitud = SolicitudGenerarPreguntas(
                    id_tema=ruta.stem, titulo_tema=ruta.stem, resumen=resumen, cantidad=args.cantidad, dificultad=dificultad
                )
                lote = {"material": ruta.name, "dificultad": dificultad, "lote": n, "caracteres": fuente.caracteres}
                inicio = time.perf_counter()
                try:
                    datos = servicio.generar(solicitud)
                    lote.update(resultado="ok", preguntas=len(datos["preguntas"]), distribucion=datos["distribucion"])
                    for p in datos["preguntas"]:
                        muestra.append(
                            {
                                "material": ruta.name,
                                "dificultad_pedida": dificultad,
                                "enunciado": p["enunciado"],
                                "dificultad": p["dificultad"],
                                "opciones": p["opciones"],
                                "correcta": p["correcta"],
                                "explicacion": p["explicacion"],
                                "fundamento": p["fundamento"],
                                "revision": {c: None for c in CAMPOS_REVISION},
                            }
                        )
                except Exception as error:  # noqa: BLE001 - se registra el tipo para el informe
                    lote.update(resultado=f"fallo: {type(error).__name__}", preguntas=0)
                lote["segundos"] = round(time.perf_counter() - inicio, 1)
                lote["rondas"] = len(registrador.brutos)
                motivos = Counter()
                descartadas = 0
                for bruto in registrador.brutos:
                    try:
                        _, descartes = analizar_preguntas(bruto, fuente, modo_asistido=False)
                    except Exception:  # noqa: BLE001
                        descartes = ["respuesta ilegible"]
                    descartadas += len(descartes)
                    motivos.update(descartes)
                lote["descartadas"] = descartadas
                lote["motivos_descarte"] = dict(motivos)
                lotes.append(lote)
                print(f"{lote['material']} · {dificultad} · lote {n}: {lote['resultado']} · rondas {lote['rondas']} · descartadas {descartadas} · {lote['segundos']} s")

    ok = [l for l in lotes if l["resultado"] == "ok"]
    resumen_global = {
        "lotes": len(lotes),
        "lotes_ok": len(ok),
        "tasa_exito": round(len(ok) / len(lotes), 3) if lotes else None,
        "lotes_con_reparacion": sum(1 for l in lotes if l["rondas"] > 1),
        "descartadas_total": sum(l["descartadas"] for l in lotes),
        "preguntas_aceptadas": len(muestra),
    }
    print("\nRESUMEN:", json.dumps(resumen_global, ensure_ascii=False))
    args.salida.write_text(
        json.dumps({"resumen": resumen_global, "lotes": lotes, "preguntas": muestra}, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"Guardado en {args.salida}. Rellena 'revision' de cada pregunta (true/false) y ejecuta 'calcular'.")


def calcular(args) -> None:
    preguntas = json.loads(args.archivo.read_text(encoding="utf-8"))["preguntas"]
    revisadas = [p for p in preguntas if all(p["revision"].get(c) is not None for c in CAMPOS_REVISION)]
    if not revisadas:
        sys.exit("No hay preguntas con los tres campos de revisión rellenados.")

    def tasa(grupo, campo):
        return sum(1 for p in grupo if p["revision"][campo] is False) / len(grupo)

    print(f"Preguntas revisadas: {len(revisadas)} de {len(preguntas)}")
    print(f"Incorrectas:            {tasa(revisadas, 'correcta'):.1%}")
    print(f"Ambiguas:               {tasa(revisadas, 'sin_ambiguedad'):.1%}")
    print(f"Dificultad incoherente: {tasa(revisadas, 'dificultad_coherente'):.1%}")
    problematicas = sum(1 for p in revisadas if not all(p["revision"][c] for c in CAMPOS_REVISION))
    print(f"Con al menos un problema: {problematicas / len(revisadas):.1%}")
    for nivel in DIFICULTADES:
        grupo = [p for p in revisadas if p["dificultad_pedida"] == nivel]
        if grupo:
            print(f"  {nivel}: n={len(grupo)} · incorrectas {tasa(grupo, 'correcta'):.0%} · ambiguas {tasa(grupo, 'sin_ambiguedad'):.0%} · dificultad {tasa(grupo, 'dificultad_coherente'):.0%}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="modo", required=True)
    g = sub.add_parser("generar")
    g.add_argument("materiales", type=Path, nargs="+")
    g.add_argument("--cantidad", type=int, default=6)
    g.add_argument("--lotes", type=int, default=1, help="repeticiones por material y dificultad")
    g.add_argument("--salida", type=Path, default=Path("validacion_preguntas.json"))
    g.set_defaults(funcion=generar)
    c = sub.add_parser("calcular")
    c.add_argument("archivo", type=Path)
    c.set_defaults(funcion=calcular)
    args = parser.parse_args()
    args.funcion(args)


if __name__ == "__main__":
    main()