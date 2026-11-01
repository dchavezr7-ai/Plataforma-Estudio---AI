import { beforeEach, describe, expect, it, vi } from "vitest";
import { CLAVES_SESION, VERSION_PERSISTENCIA, esRutaRestaurable, guardarRutaPersistida, guardarUsuarioPersistido, leerEstudioPersistido, leerRutaPersistida, leerUsuarioPersistido } from "./persistenciaSesion";

const usuario = { id: "g-1", nombre: "Ana", apellido: "Pérez", correo: "ana@correo.com", creadoEn: "2026-01-01T00:00:00.000Z" };
const resumenes = { t1: { esencial: {}, general: {}, metadatos: {} } };

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  vi.resetModules();
});

describe("persistencia temporal de la sesión", () => {
  it("guarda y recupera el perfil sin ningún token", () => {
    guardarUsuarioPersistido(usuario);
    expect(leerUsuarioPersistido()).toEqual({ ...usuario, foto: undefined });
    expect(sessionStorage.getItem(CLAVES_SESION.usuario)).not.toMatch(/token/i);
    expect(localStorage.length).toBe(0);
  });

  it("descarta JSON corrupto, versiones antiguas y perfiles incompletos", () => {
    sessionStorage.setItem(CLAVES_SESION.usuario, "{no es json");
    expect(leerUsuarioPersistido()).toBeNull();
    sessionStorage.setItem(CLAVES_SESION.usuario, JSON.stringify({ v: VERSION_PERSISTENCIA + 1, datos: usuario }));
    expect(leerUsuarioPersistido()).toBeNull();
    sessionStorage.setItem(CLAVES_SESION.usuario, JSON.stringify({ v: VERSION_PERSISTENCIA, datos: { id: "x" } }));
    expect(leerUsuarioPersistido()).toBeNull();
  });

  it("solo restaura el estudio de la misma cuenta y filtra entradas dañadas", () => {
    sessionStorage.setItem(
      CLAVES_SESION.estudio,
      JSON.stringify({ v: VERSION_PERSISTENCIA, datos: { usuarioId: "g-1", iniciadoEn: 5, fuentes: { t1: "texto", t2: 7 }, resumenes: { ...resumenes, malo: 1 }, mapas: { m: { huella: "h" } }, actividad: [{ id: "x" }] } })
    );
    expect(leerEstudioPersistido("g-2")).toBeNull();
    const estudio = leerEstudioPersistido("g-1")!;
    expect(estudio.fuentes).toEqual({ t1: "texto" });
    expect(Object.keys(estudio.resumenes)).toEqual(["t1"]);
    expect(estudio.mapas).toEqual({});
    expect(estudio.actividad).toEqual([]);
  });

  it("solo acepta rutas internas restaurables", () => {
    expect(esRutaRestaurable("/estudio/t1/prueba")).toBe(true);
    for (const mala of ["/", "/iniciar-sesion", "//evil.com", "https://evil.com", 3]) expect(esRutaRestaurable(mala)).toBe(false);
    guardarRutaPersistida("/estudio/t1/resumen");
    expect(leerRutaPersistida()).toBe("/estudio/t1/resumen");
  });
});

describe("recuperación tras recargar (servicio de autenticación)", () => {
  it("restaura usuario y estudio al arrancar de nuevo y los borra al cerrar sesión", async () => {
    sessionStorage.setItem(CLAVES_SESION.usuario, JSON.stringify({ v: VERSION_PERSISTENCIA, datos: usuario }));
    sessionStorage.setItem(CLAVES_SESION.estudio, JSON.stringify({ v: VERSION_PERSISTENCIA, datos: { usuarioId: "g-1", iniciadoEn: 1, fuentes: { t1: "apuntes" }, resumenes, mapas: {}, actividad: [] } }));
    guardarRutaPersistida("/estudio/t1/prueba");

    // Un módulo nuevo equivale al arranque del frontend tras F5.
    const auth = await import("../servicios/servicioAutenticacion");
    const sesion = await import("./almacenSesion");
    expect(auth.obtenerUsuarioActual()?.correo).toBe("ana@correo.com");
    expect(sesion.obtenerSesion().fuentes.t1).toBe("apuntes");
    expect(Object.keys(sesion.obtenerSesion().resumenes)).toEqual(["t1"]);

    auth.cerrarSesion();
    expect(auth.obtenerUsuarioActual()).toBeNull();
    expect(sessionStorage.length).toBe(0);
    expect(sesion.obtenerSesion().resumenes).toEqual({});
  });

  it("sin sesión guardada no hay usuario", async () => {
    const auth = await import("../servicios/servicioAutenticacion");
    expect(auth.obtenerUsuarioActual()).toBeNull();
  });
});
