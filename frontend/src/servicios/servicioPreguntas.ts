import type { DificultadPregunta, PreguntaEstudio } from "../tipos";
import { enviarJson } from "./clienteApi";
import { obtenerResumenGeneral } from "./servicioPruebas";

// -----------------------------------------------------------------------
// Servicio de Preguntas de práctica (MOD-03).
// Frontend → POST /api/preguntas/generar (FastAPI) → OpenAI.
// Las preguntas se generan a partir del resumen general del tema y se guardan
// SOLO en memoria por tema: así abrir y cerrar la pantalla no vuelve a llamar a la IA.
// No toca el almacén de sesión (MOD-08).
// -----------------------------------------------------------------------

const TIEMPO_GENERACION_MS = 150_000;
const CANTIDAD_POR_DEFECTO = 10;

interface PreguntaApi {
  id: string;
  enunciado: string;
  dificultad: DificultadPregunta;
  opciones: { id: string; texto: string }[];
  correcta: string;
  explicacion: string;
  fundamento: string;
  conceptos: string[];
}

interface RespuestaApi {
  id_tema: string;
  preguntas: PreguntaApi[];
}

export interface OpcionesGeneracion {
  cantidad?: number;
  dificultad?: DificultadPregunta;
  /** Nivel estimado 0-1 (lo aportará MOD-07). */
  nivelEstudiante?: number;
  /** Enunciados ya vistos, para no repetirlos. */
  evitar?: string[];
  senal?: AbortSignal;
}

const memoria = new Map<string, PreguntaEstudio[]>();
const enVuelo = new Map<string, Promise<PreguntaEstudio[]>>();

const CARACTERES_POR_PREGUNTA = 300; // mismo criterio que el backend
const MAXIMO_PREGUNTAS = 25;

type ResumenGeneral = NonNullable<ReturnType<typeof obtenerResumenGeneral>>;

/** Estimación de los caracteres de texto fuente del resumen. */
function contarCaracteres(r: ResumenGeneral): number {
  let total = (r.titulo ?? "").length + (r.introduccion ?? "").length;
  for (const s of r.secciones ?? []) {
    total += (s.titulo ?? "").length + (s.contenido ?? "").length + (s.puntos ?? []).join(" ").length;
    if (s.tabla) total += s.tabla.filas.map((f) => f.join(" ")).join(" ").length;
  }
  return total;
}

function capacidadDelResumen(r: ResumenGeneral): number {
  return Math.min(MAXIMO_PREGUNTAS, Math.floor(contarCaracteres(r) / CARACTERES_POR_PREGUNTA));
}

/** Indica si el tema tiene un resumen con texto suficiente para generar preguntas con IA. */
export function puedeGenerarConIa(idTema: string): boolean {
  const resumen = obtenerResumenGeneral(idTema);
  return resumen !== null && capacidadDelResumen(resumen) >= 1;
}

export function limpiarPreguntasEnMemoria(idTema?: string) {
  if (idTema) {
    memoria.delete(idTema);
    enVuelo.delete(idTema);
  } else {
    memoria.clear();
    enVuelo.clear();
  }
}

function aPreguntaEstudio(idTema: string, p: PreguntaApi): PreguntaEstudio {
  return {
    id: `${idTema}-${p.id}`,
    idTema,
    enunciado: p.enunciado,
    tipo: "opcion-multiple",
    dificultad: p.dificultad,
    opciones: p.opciones.map((o) => ({ id: o.id, etiqueta: o.texto })),
    idOpcionCorrecta: p.correcta,
    explicacion: p.explicacion,
  };
}

/** Pide preguntas nuevas al backend. Lanza ErrorApi (con mensaje apto para el usuario) si falla. */
export async function generarPreguntasConIa(idTema: string, titulo: string, opciones: OpcionesGeneracion = {}): Promise<PreguntaEstudio[]> {
  const resumen = obtenerResumenGeneral(idTema);
  if (!resumen) throw new Error("El tema no tiene resumen general.");
  const capacidad = capacidadDelResumen(resumen);
  if (capacidad < 1) throw new Error("El resumen del tema es demasiado breve para generar preguntas.");
  const cuerpo = {
    id_tema: idTema,
    titulo_tema: titulo,
    cantidad: Math.min(opciones.cantidad ?? CANTIDAD_POR_DEFECTO, capacidad),
    dificultad: opciones.dificultad ?? "media",
    nivel_estudiante: opciones.nivelEstudiante ?? null,
    evitar: opciones.evitar ?? [],
    resumen: {
      titulo: resumen.titulo,
      introduccion: resumen.introduccion,
      secciones: resumen.secciones.map((s) => ({
        titulo: s.titulo,
        contenido: s.contenido,
        puntos: s.puntos,
        tabla: s.tabla ? { titulo: s.tabla.titulo ?? "", encabezados: s.tabla.encabezados, filas: s.tabla.filas } : null,
      })),
    },
  };
  const datos = await enviarJson<RespuestaApi>("/api/preguntas/generar", cuerpo, { senal: opciones.senal, tiempoEsperaMs: TIEMPO_GENERACION_MS });
  return datos.preguntas.map((p) => aPreguntaEstudio(idTema, p));
}

/** Preguntas del tema: memoria → solicitud en curso → backend. Una sola llamada por tema. */
export async function obtenerPreguntasDelTema(idTema: string, titulo: string, opciones: OpcionesGeneracion = {}): Promise<PreguntaEstudio[]> {
  const guardadas = memoria.get(idTema);
  if (guardadas) return guardadas;

  let solicitud = enVuelo.get(idTema);
  if (!solicitud) {
    const { senal: _ignorada, ...sinSenal } = opciones; // la solicitud compartida no se cancela por un solo llamador
    solicitud = generarPreguntasConIa(idTema, titulo, sinSenal)
      .then((nuevas) => {
        memoria.set(idTema, nuevas);
        return nuevas;
      })
      .finally(() => enVuelo.delete(idTema));
    enVuelo.set(idTema, solicitud);
  }

  const senal = opciones.senal;
  if (!senal) return solicitud;
  return new Promise<PreguntaEstudio[]>((resolver, rechazar) => {
    const abortar = () => rechazar(new DOMException("Cancelado", "AbortError"));
    if (senal.aborted) return abortar();
    senal.addEventListener("abort", abortar, { once: true });
    solicitud.then(resolver, rechazar);
  });
}