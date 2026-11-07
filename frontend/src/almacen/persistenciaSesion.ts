import type { MapaMental, ResumenesGenerados, Usuario } from "../tipos";
import type { TipoActividad } from "../datos/actividades";
import { NIVELES, type RespuestaRegistrada } from "../utilidades/rendimiento";

// -----------------------------------------------------------------------
// Persistencia TEMPORAL de la sesión, exclusivamente en sessionStorage.
//
// Qué resuelve: al recargar la página (F5 / Ctrl+R) el frontend vuelve a arrancar y
// pierde todo lo que vivía en memoria (perfil, resúmenes, mapas…). Este módulo es el
// único punto que lee y escribe ese estado, para que no haya claves sueltas.
//
// Qué NO guarda, a propósito:
//   · tokens, contraseñas ni credenciales (el token de Google se descarta al leer el perfil);
//   · archivos PDF (un File no es serializable; el estudiante debe adjuntarlo de nuevo).
//
// sessionStorage se conserva al recargar y se elimina al cerrar la pestaña. Todas las
// claves llevan el prefijo "estudioai." para que `limpiarDatosDeUsuario` las borre al
// cerrar sesión. Cada valor va dentro de un sobre versionado: si cambia la forma de los
// datos, se sube VERSION y lo antiguo se descarta en vez de romper la aplicación.
// -----------------------------------------------------------------------

export const VERSION_PERSISTENCIA = 1;

export const CLAVES_SESION = {
  usuario: "estudioai.sesion.usuario",
  estudio: "estudioai.sesion.estudio",
  ruta: "estudioai.sesion.ruta",
} as const;

interface Sobre<T> {
  v: number;
  datos: T;
}

function almacen(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

function leerSobre(clave: string): unknown {
  const a = almacen();
  if (!a) return undefined;
  try {
    const bruto = a.getItem(clave);
    if (!bruto) return undefined;
    const sobre = JSON.parse(bruto) as Partial<Sobre<unknown>> | null;
    if (!sobre || typeof sobre !== "object" || sobre.v !== VERSION_PERSISTENCIA) {
      a.removeItem(clave); // versión antigua o forma desconocida: se descarta
      return undefined;
    }
    return sobre.datos;
  } catch {
    try {
      a.removeItem(clave); // JSON corrupto
    } catch {
      /* nada que hacer */
    }
    return undefined;
  }
}

function escribirSobre(clave: string, datos: unknown): void {
  const a = almacen();
  if (!a) return;
  try {
    a.setItem(clave, JSON.stringify({ v: VERSION_PERSISTENCIA, datos } satisfies Sobre<unknown>));
  } catch {
    /* cuota llena o almacenamiento bloqueado: la persistencia es opcional, la app sigue funcionando */
  }
}

function borrar(clave: string): void {
  try {
    almacen()?.removeItem(clave);
  } catch {
    /* no crítico */
  }
}

const esObjeto = (valor: unknown): valor is Record<string, unknown> => typeof valor === "object" && valor !== null && !Array.isArray(valor);
const esTexto = (valor: unknown): valor is string => typeof valor === "string";

// --- Perfil del usuario (sin ningún token) -----------------------------------------------

function validarUsuario(bruto: unknown): Usuario | null {
  if (!esObjeto(bruto)) return null;
  const { id, nombre, apellido, correo, foto, creadoEn } = bruto;
  if (!esTexto(id) || !id || !esTexto(nombre) || !esTexto(correo) || !correo.includes("@")) return null;
  return {
    id,
    nombre,
    apellido: esTexto(apellido) ? apellido : "",
    correo,
    foto: esTexto(foto) && /^https:\/\//i.test(foto) ? foto : undefined,
    creadoEn: esTexto(creadoEn) ? creadoEn : new Date().toISOString(),
  };
}

export const guardarUsuarioPersistido = (usuario: Usuario) => escribirSobre(CLAVES_SESION.usuario, usuario);
export const leerUsuarioPersistido = (): Usuario | null => validarUsuario(leerSobre(CLAVES_SESION.usuario));

// --- Estado de estudio (resúmenes, mapas, fuentes, actividad) ----------------------------

export interface ActividadPersistida {
  id: string;
  tipo: TipoActividad;
  idTema: string;
  tituloTema: string;
  descripcion: string;
  at: number;
}

export interface EstudioPersistido {
  /** Cuenta a la que pertenecen estos datos: si cambia el usuario, no se restauran. */
  usuarioId: string;
  iniciadoEn: number;
  fuentes: Record<string, string>;
  resumenes: Record<string, ResumenesGenerados>;
  mapas: Record<string, { mapa: MapaMental; huella: string }>;
  actividad: ActividadPersistida[];
  /** MOD-08: respuestas registradas por tema (de ellas se derivan contadores, rachas y tiempos). */
  rendimiento: Record<string, RespuestaRegistrada[]>;
}

function filtrarRegistro<T>(bruto: unknown, valido: (valor: unknown) => valor is T): Record<string, T> {
  if (!esObjeto(bruto)) return {};
  return Object.fromEntries(Object.entries(bruto).filter(([, valor]) => valido(valor))) as Record<string, T>;
}

const esResumen = (v: unknown): v is ResumenesGenerados => esObjeto(v) && esObjeto(v.general) && esObjeto(v.esencial) && esObjeto(v.metadatos);
const esMapa = (v: unknown): v is { mapa: MapaMental; huella: string } =>
  esObjeto(v) && esTexto(v.huella) && esObjeto(v.mapa) && Array.isArray(v.mapa.nodos) && Array.isArray(v.mapa.aristas);
const esActividad = (v: unknown): v is ActividadPersistida =>
  esObjeto(v) && esTexto(v.id) && esTexto(v.tipo) && esTexto(v.idTema) && esTexto(v.tituloTema) && esTexto(v.descripcion) && typeof v.at === "number";

const esRespuestaRegistrada = (v: unknown): v is RespuestaRegistrada =>
  esObjeto(v) &&
  (NIVELES as readonly unknown[]).includes(v.dificultad) &&
  typeof v.correcta === "boolean" &&
  (v.segundos === null || (typeof v.segundos === "number" && Number.isFinite(v.segundos) && v.segundos >= 0)) &&
  (v.origen === "practica" || v.origen === "prueba") &&
  typeof v.at === "number";

/** Conserva solo las respuestas íntegras; si falta el campo (datos de versiones anteriores) queda vacío. */
const sanearRendimiento = (bruto: unknown): Record<string, RespuestaRegistrada[]> =>
  Object.fromEntries(Object.entries(filtrarRegistro(bruto, Array.isArray)).map(([idTema, lista]) => [idTema, (lista as unknown[]).filter(esRespuestaRegistrada)]));

/** Devuelve el estudio guardado solo si es íntegro y pertenece a `usuarioId`; las entradas dañadas se descartan una a una. */
export function leerEstudioPersistido(usuarioId: string): EstudioPersistido | null {
  const bruto = leerSobre(CLAVES_SESION.estudio);
  if (!esObjeto(bruto) || bruto.usuarioId !== usuarioId) return null;
  return {
    usuarioId,
    iniciadoEn: typeof bruto.iniciadoEn === "number" ? bruto.iniciadoEn : Date.now(),
    fuentes: filtrarRegistro(bruto.fuentes, esTexto),
    resumenes: filtrarRegistro(bruto.resumenes, esResumen),
    mapas: filtrarRegistro(bruto.mapas, esMapa),
    actividad: Array.isArray(bruto.actividad) ? bruto.actividad.filter(esActividad) : [],
    rendimiento: sanearRendimiento(bruto.rendimiento),
  };
}

export const guardarEstudioPersistido = (estudio: Omit<EstudioPersistido, "rendimiento"> & { rendimiento?: EstudioPersistido["rendimiento"] }) => escribirSobre(CLAVES_SESION.estudio, estudio);

// --- Última ruta visitada ----------------------------------------------------------------

/** Solo se aceptan rutas internas de la aplicación; nunca el login ni URLs externas. */
export function esRutaRestaurable(ruta: unknown): ruta is string {
  return esTexto(ruta) && ruta.startsWith("/") && !ruta.startsWith("//") && !ruta.startsWith("/iniciar-sesion") && ruta !== "/";
}

export const guardarRutaPersistida = (ruta: string) => {
  if (esRutaRestaurable(ruta)) escribirSobre(CLAVES_SESION.ruta, ruta);
};
export function leerRutaPersistida(): string | null {
  const ruta = leerSobre(CLAVES_SESION.ruta);
  return esRutaRestaurable(ruta) ? ruta : null;
}

/** Borra todo lo que este módulo guardó (cierre de sesión). */
export function borrarSesionPersistida(): void {
  Object.values(CLAVES_SESION).forEach(borrar);
}
