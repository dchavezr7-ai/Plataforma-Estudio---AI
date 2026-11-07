import type { NivelPregunta } from "../tipos/prueba";

// -----------------------------------------------------------------------
// MOD-08 · TASK-0082 · Variables de rendimiento por tema (lógica pura, sin React ni almacenamiento).
//
// Lo único que se guarda es el registro de respuestas; contadores por dificultad, porcentaje
// acumulado, rachas y tiempo medio se DERIVAN de él, así nunca quedan incoherentes entre sí.
// Pendiente (depende de TASK-0071/0072, sin definir): "nivel previo" del estudiante.
// -----------------------------------------------------------------------

/** Tope de respuestas guardadas por tema; al superarlo se descartan las más antiguas. */
export const MAX_RESPUESTAS_POR_TEMA = 1000;
/** Una respuesta que tarda más (pestaña abandonada) se limita a este valor para no distorsionar el tiempo medio. */
export const MAX_SEGUNDOS_POR_RESPUESTA = 300;

export const NIVELES: readonly NivelPregunta[] = ["facil", "media", "dificil"];
export type OrigenRespuesta = "practica" | "prueba";

export interface RespuestaRegistrada {
  dificultad: NivelPregunta;
  correcta: boolean;
  /** Segundos que tardó en responder; null si no se mide (la prueba solo informa su duración total). */
  segundos: number | null;
  origen: OrigenRespuesta;
  /** Marca de tiempo (ms) del registro. */
  at: number;
}

export interface ContadorNivel {
  preguntas: number;
  correctas: number;
  /** 0–1, o null si aún no hay respuestas. */
  porcentaje: number | null;
  tiempoMedioSegundos: number | null;
}

export interface Rendimiento {
  total: number;
  correctas: number;
  /** 0–1, o null si aún no hay respuestas. */
  porcentajeAcumulado: number | null;
  porDificultad: Record<NivelPregunta, ContadorNivel>;
  rachaActual: number;
  mejorRacha: number;
  tiempoMedioSegundos: number | null;
}

/** Segundos entre dos marcas (ms), con un decimal y limitados a [0, MAX_SEGUNDOS_POR_RESPUESTA]. */
export const segundosEntre = (inicioMs: number, finMs: number): number =>
  Math.round(Math.min(MAX_SEGUNDOS_POR_RESPUESTA, Math.max(0, (finMs - inicioMs) / 1000)) * 10) / 10;

/** Añade respuestas al final sin mutar; si se supera el tope, descarta las más antiguas. */
export const anadirRespuestas = (actuales: RespuestaRegistrada[], nuevas: RespuestaRegistrada[]): RespuestaRegistrada[] =>
  [...actuales, ...nuevas].slice(-MAX_RESPUESTAS_POR_TEMA);

const media = (valores: number[], decimales: number): number | null => {
  if (valores.length === 0) return null;
  const f = 10 ** decimales;
  return Math.round((valores.reduce((a, b) => a + b, 0) / valores.length) * f) / f;
};
const tiempos = (respuestas: RespuestaRegistrada[]) => respuestas.flatMap((r) => (r.segundos === null ? [] : [r.segundos]));

export function calcularRendimiento(respuestas: RespuestaRegistrada[]): Rendimiento {
  const porDificultad = Object.fromEntries(
    NIVELES.map((nivel) => {
      const delNivel = respuestas.filter((r) => r.dificultad === nivel);
      const aciertos = delNivel.filter((r) => r.correcta).length;
      return [nivel, { preguntas: delNivel.length, correctas: aciertos, porcentaje: media(delNivel.map((r) => (r.correcta ? 1 : 0)), 4), tiempoMedioSegundos: media(tiempos(delNivel), 1) }];
    })
  ) as Record<NivelPregunta, ContadorNivel>;

  let rachaActual = 0;
  let mejorRacha = 0;
  for (const r of respuestas) {
    rachaActual = r.correcta ? rachaActual + 1 : 0;
    mejorRacha = Math.max(mejorRacha, rachaActual);
  }

  return {
    total: respuestas.length,
    correctas: respuestas.filter((r) => r.correcta).length,
    porcentajeAcumulado: media(respuestas.map((r) => (r.correcta ? 1 : 0)), 4),
    porDificultad,
    rachaActual,
    mejorRacha,
    tiempoMedioSegundos: media(tiempos(respuestas), 1),
  };
}

/** Une los registros de varios temas en orden cronológico (cifras globales de la sesión). */
export const unirRespuestas = (registros: RespuestaRegistrada[][]): RespuestaRegistrada[] => registros.flat().sort((a, b) => a.at - b.at);

/** Convierte la revisión de una prueba finalizada. Las preguntas omitidas no cuentan como respuesta. */
export function respuestasDeRevision(
  revision: { dificultad: NivelPregunta; estado: "correcta" | "incorrecta" | "omitida" }[]
): Omit<RespuestaRegistrada, "at">[] {
  return revision
    .filter((item) => item.estado !== "omitida")
    .map((item) => ({ dificultad: item.dificultad, correcta: item.estado === "correcta", segundos: null, origen: "prueba" as const }));
}
