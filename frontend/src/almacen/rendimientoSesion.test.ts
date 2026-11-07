import { beforeEach, describe, expect, it } from "vitest";
import { CLAVES_SESION, VERSION_PERSISTENCIA, guardarEstudioPersistido, leerEstudioPersistido } from "./persistenciaSesion";
import { eliminarDatosTema, obtenerSesion, registrarRespuestas, reiniciarSesionEstudio, restaurarEstudio } from "./almacenSesion";
import { calcularRendimiento } from "../utilidades/rendimiento";

const resp = (correcta: boolean) => ({ dificultad: "media" as const, correcta, segundos: 4, origen: "practica" as const });
const base = { usuarioId: "g-1", iniciadoEn: 1, fuentes: {}, resumenes: {}, mapas: {}, actividad: [] };

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  reiniciarSesionEstudio();
});

describe("MOD-08 · almacén de rendimiento", () => {
  it("acumula respuestas por tema sin mezclar temas", () => {
    registrarRespuestas("t1", [resp(true), resp(false)]);
    registrarRespuestas("t1", [resp(true)]);
    registrarRespuestas("t2", [resp(true)]);
    const { rendimiento } = obtenerSesion();
    expect(calcularRendimiento(rendimiento.t1).total).toBe(3);
    expect(calcularRendimiento(rendimiento.t2).total).toBe(1);
  });

  it("no hace nada con una lista vacía", () => {
    registrarRespuestas("t1", []);
    expect(obtenerSesion().rendimiento).toEqual({});
  });

  it("eliminar un tema borra solo su rendimiento", () => {
    registrarRespuestas("t1", [resp(true)]);
    registrarRespuestas("t2", [resp(true)]);
    eliminarDatosTema("t1");
    expect(Object.keys(obtenerSesion().rendimiento)).toEqual(["t2"]);
  });

  it("reiniciar la sesión (cierre de sesión) borra todo el rendimiento", () => {
    registrarRespuestas("t1", [resp(true)]);
    reiniciarSesionEstudio();
    expect(obtenerSesion().rendimiento).toEqual({});
  });

  it("sobrevive a una recarga (sessionStorage) solo para la misma cuenta", () => {
    registrarRespuestas("t1", [resp(true), resp(true), resp(false)]);
    guardarEstudioPersistido({ ...base, rendimiento: obtenerSesion().rendimiento });
    reiniciarSesionEstudio();
    restaurarEstudio("g-2");
    expect(obtenerSesion().rendimiento).toEqual({});
    restaurarEstudio("g-1");
    expect(calcularRendimiento(obtenerSesion().rendimiento.t1)).toMatchObject({ total: 3, correctas: 2 });
  });

  it("los datos guardados sin el campo (versión anterior) se leen como vacíos", () => {
    sessionStorage.setItem(CLAVES_SESION.estudio, JSON.stringify({ v: VERSION_PERSISTENCIA, datos: base }));
    expect(leerEstudioPersistido("g-1")?.rendimiento).toEqual({});
  });

  it("descarta las respuestas dañadas y conserva las íntegras", () => {
    const buena = { dificultad: "facil", correcta: true, segundos: null, origen: "prueba", at: 1 };
    sessionStorage.setItem(
      CLAVES_SESION.estudio,
      JSON.stringify({ v: VERSION_PERSISTENCIA, datos: { ...base, rendimiento: { t1: [buena, { dificultad: "imposible" }, 7], basura: 5 } } })
    );
    const leido = leerEstudioPersistido("g-1")!.rendimiento;
    expect(leido.t1).toEqual([buena]);
    expect(leido.basura).toBeUndefined();
  });
});
