import { useSyncExternalStore } from "react";
import type { MapaMental, ResumenesGenerados } from "../tipos";
import type { TipoActividad } from "../datos/actividades";
import { guardarEstudioPersistido, leerEstudioPersistido } from "./persistenciaSesion";
import { anadirRespuestas, type RespuestaRegistrada } from "../utilidades/rendimiento";

// -----------------------------------------------------------------------
// Estado de la sesión de estudio.
// Contenido introducido, resúmenes generados, mapas, actividad y rendimiento (MOD-08) viven en memoria y,
// mientras haya una cuenta activa, se reflejan en sessionStorage (ver
// persistenciaSesion.ts) para sobrevivir a F5 / Ctrl+R. Al cerrar sesión o cerrar la
// pestaña desaparecen. Los PDF (File) nunca se guardan: no son serializables.
// No hay base de datos ni localStorage aquí, a propósito.
// -----------------------------------------------------------------------

export interface ActividadSesion {
  id: string;
  tipo: TipoActividad;
  idTema: string;
  tituloTema: string;
  descripcion: string;
  at: number;
}

/** Mapa conceptual generado y la huella de la fuente con la que se generó (si la fuente cambia, deja de valer). */
export interface MapaGuardado {
  mapa: MapaMental;
  huella: string;
}

interface EstadoSesion {
  iniciadoEn: number;
  /** Último contenido escrito por el usuario para cada tema. */
  fuentes: Record<string, string>;
  /** PDF original de cada tema (solo en memoria; se envía a la IA tal cual para generar el resumen). */
  archivos: Record<string, File>;
  resumenes: Record<string, ResumenesGenerados>;
  mapas: Record<string, MapaGuardado>;
  actividad: ActividadSesion[];
  /** MOD-08: respuestas de práctica y pruebas por tema; el rendimiento se deriva con `calcularRendimiento`. */
  rendimiento: Record<string, RespuestaRegistrada[]>;
}

let estadoGlobal: EstadoSesion = { iniciadoEn: Date.now(), fuentes: {}, archivos: {}, resumenes: {}, mapas: {}, actividad: [], rendimiento: {} };
const oyentes = new Set<() => void>();
let siguienteId = 1;

// --- Persistencia temporal (sessionStorage) ---------------------------------
const RETARDO_GUARDADO_MS = 250;
let usuarioPersistidoId: string | null = null;
let temporizadorGuardado: number | undefined;

function volcarAlmacenamiento() {
  temporizadorGuardado = undefined;
  if (!usuarioPersistidoId) return;
  const { iniciadoEn, fuentes, resumenes, mapas, actividad, rendimiento } = estadoGlobal;
  guardarEstudioPersistido({ usuarioId: usuarioPersistidoId, iniciadoEn, fuentes, resumenes, mapas, actividad, rendimiento });
}

function programarGuardado() {
  if (!usuarioPersistidoId || typeof window === "undefined") return;
  window.clearTimeout(temporizadorGuardado);
  temporizadorGuardado = window.setTimeout(volcarAlmacenamiento, RETARDO_GUARDADO_MS);
}

// Si la recarga llega antes de que venza el temporizador, se vuelca lo pendiente.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    if (temporizadorGuardado !== undefined) {
      window.clearTimeout(temporizadorGuardado);
      volcarAlmacenamiento();
    }
  });
}

/** Empieza a reflejar el estudio de `idUsuario` en sessionStorage (tras iniciar sesión o restaurarla). */
export function activarPersistenciaEstudio(idUsuario: string) {
  usuarioPersistidoId = idUsuario;
  programarGuardado();
}

/** Recupera lo guardado para `idUsuario` (si existe y es íntegro) y activa la persistencia. */
export function restaurarEstudio(idUsuario: string) {
  const guardado = leerEstudioPersistido(idUsuario);
  if (guardado) {
    const numeros = guardado.actividad.map((a) => Number(a.id.replace(/^act-/, ""))).filter(Number.isFinite);
    siguienteId = Math.max(siguienteId, ...numeros, 0) + 1;
    estadoGlobal = { ...estadoGlobal, iniciadoEn: guardado.iniciadoEn, fuentes: guardado.fuentes, resumenes: guardado.resumenes, mapas: guardado.mapas, actividad: guardado.actividad, rendimiento: guardado.rendimiento };
    oyentes.forEach((oyente) => oyente());
  }
  usuarioPersistidoId = idUsuario;
}

function actualizar(siguiente: Partial<EstadoSesion>) {
  estadoGlobal = { ...estadoGlobal, ...siguiente };
  oyentes.forEach((oyente) => oyente());
  programarGuardado();
}

function suscribir(oyente: () => void) {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

export function useSesion<T>(selector: (s: EstadoSesion) => T): T {
  return useSyncExternalStore(suscribir, () => selector(estadoGlobal));
}

export function obtenerSesion(): EstadoSesion {
  return estadoGlobal;
}

/** Olvida todo el contenido de estudio de la sesión (al cerrar sesión o cambiar de cuenta). */
export function reiniciarSesionEstudio() {
  // Se corta la persistencia ANTES de vaciar: un guardado pendiente no debe reescribir lo que se acaba de borrar.
  if (typeof window !== "undefined") window.clearTimeout(temporizadorGuardado);
  temporizadorGuardado = undefined;
  usuarioPersistidoId = null;
  actualizar({ iniciadoEn: Date.now(), fuentes: {}, archivos: {}, resumenes: {}, mapas: {}, actividad: [], rendimiento: {} });
}

export function establecerFuenteTema(idTema: string, contenido: string) {
  actualizar({ fuentes: { ...estadoGlobal.fuentes, [idTema]: contenido } });
}

export function establecerArchivoTema(idTema: string, archivo: File | null) {
  const { [idTema]: _anterior, ...resto } = estadoGlobal.archivos;
  actualizar({ archivos: archivo ? { ...resto, [idTema]: archivo } : resto });
}

/** Olvida el contenido, el PDF, los resúmenes y el mapa conceptual de la sesión asociados a un tema eliminado. */
export function eliminarDatosTema(idTema: string) {
  const sinClave = <T,>(registro: Record<string, T>) => Object.fromEntries(Object.entries(registro).filter(([clave]) => clave !== idTema));
  actualizar({
    fuentes: sinClave(estadoGlobal.fuentes),
    archivos: sinClave(estadoGlobal.archivos),
    resumenes: sinClave(estadoGlobal.resumenes),
    mapas: sinClave(estadoGlobal.mapas),
    rendimiento: sinClave(estadoGlobal.rendimiento),
  });
}

export function registrarActividad(entrada: Omit<ActividadSesion, "id" | "at">) {
  const elemento: ActividadSesion = { ...entrada, id: `act-${siguienteId++}`, at: Date.now() };
  actualizar({ actividad: [elemento, ...estadoGlobal.actividad].slice(0, 50) });
}

/** MOD-08: añade respuestas (práctica o prueba) al registro de rendimiento del tema. */
export function registrarRespuestas(idTema: string, respuestas: Omit<RespuestaRegistrada, "at">[]) {
  if (respuestas.length === 0) return;
  const at = Date.now();
  const previas = estadoGlobal.rendimiento[idTema] ?? [];
  actualizar({ rendimiento: { ...estadoGlobal.rendimiento, [idTema]: anadirRespuestas(previas, respuestas.map((r) => ({ ...r, at }))) } });
}

export function guardarResumenes(idTema: string, tituloTema: string, resultado: ResumenesGenerados) {
  actualizar({ resumenes: { ...estadoGlobal.resumenes, [idTema]: resultado } });
  registrarActividad({ tipo: "resumen", idTema, tituloTema, descripcion: "Generaste el resumen general y el esencial." });
}

/** Guarda el mapa conceptual generado con IA para un tema (solo en memoria, como los resúmenes). */
export function guardarMapa(idTema: string, mapa: MapaMental, huella: string) {
  actualizar({ mapas: { ...estadoGlobal.mapas, [idTema]: { mapa, huella } } });
}
