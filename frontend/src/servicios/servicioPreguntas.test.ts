import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./clienteApi", () => ({ enviarJson: vi.fn() }));
vi.mock("./servicioPruebas", () => ({ obtenerResumenGeneral: vi.fn() }));

import { enviarJson } from "./clienteApi";
import { obtenerResumenGeneral } from "./servicioPruebas";
import { generarPreguntasConIa, limpiarPreguntasEnMemoria, obtenerPreguntasDelTema, puedeGenerarConIa } from "./servicioPreguntas";

const enviar = vi.mocked(enviarJson);
const resumenMock = vi.mocked(obtenerResumenGeneral);

function resumenCon(caracteres: number) {
  return {
    titulo: "Tema",
    introduccion: "",
    secciones: [{ titulo: "S", contenido: "a".repeat(caracteres), puntos: [], tabla: null }],
  } as never;
}

const respuestaApi = {
  id_tema: "t1",
  preguntas: [
    {
      id: "qabc",
      enunciado: "¿Qué es X?",
      dificultad: "media",
      opciones: [
        { id: "a", texto: "Uno" },
        { id: "b", texto: "Dos" },
        { id: "c", texto: "Tres" },
        { id: "d", texto: "Cuatro" },
      ],
      correcta: "b",
      explicacion: "Porque sí.",
      fundamento: "texto",
      conceptos: ["x"],
    },
  ],
};

beforeEach(() => {
  limpiarPreguntasEnMemoria();
  enviar.mockReset();
  resumenMock.mockReset();
  resumenMock.mockReturnValue(resumenCon(3000));
  enviar.mockResolvedValue(respuestaApi);
});

describe("servicioPreguntas", () => {
    it("mapea la respuesta del backend a PreguntaEstudio", async () => {
    const preguntas = await generarPreguntasConIa("t1", "Tema");
    expect(preguntas).toHaveLength(1);
    const p = preguntas[0];
    if (!p) throw new Error("Sin preguntas");
    expect(p).toMatchObject({
      id: "t1-qabc",
      idTema: "t1",
      tipo: "opcion-multiple",
      idOpcionCorrecta: "b",
      explicacion: "Porque sí.",
    });
    expect(p.opciones?.[0]).toEqual({ id: "a", etiqueta: "Uno" });
  });

  it("ajusta la cantidad a la capacidad del resumen", async () => {
    resumenMock.mockReturnValue(resumenCon(900)); // ~3 preguntas
    await generarPreguntasConIa("t1", "Tema", { cantidad: 10 });
    expect(enviar.mock.calls[0]?.[1]).toMatchObject({ cantidad: 3 });
  });

  it("puedeGenerarConIa exige texto suficiente", () => {
    expect(puedeGenerarConIa("t1")).toBe(true);
    resumenMock.mockReturnValue(resumenCon(100));
    expect(puedeGenerarConIa("t1")).toBe(false);
    resumenMock.mockReturnValue(null);
    expect(puedeGenerarConIa("t1")).toBe(false);
  });

  it("guarda en memoria: la segunda llamada no vuelve a la IA", async () => {
    await obtenerPreguntasDelTema("t1", "Tema");
    await obtenerPreguntasDelTema("t1", "Tema");
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it("comparte la solicitud en vuelo entre llamadas simultáneas", async () => {
    const [a, b] = await Promise.all([obtenerPreguntasDelTema("t1", "Tema"), obtenerPreguntasDelTema("t1", "Tema")]);
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it("no guarda en memoria si falla, y permite reintentar", async () => {
    enviar.mockRejectedValueOnce(new Error("falla"));
    await expect(obtenerPreguntasDelTema("t1", "Tema")).rejects.toThrow("falla");
    await obtenerPreguntasDelTema("t1", "Tema");
    expect(enviar).toHaveBeenCalledTimes(2);
  });

  it("limpiarPreguntasEnMemoria fuerza una nueva generación", async () => {
    await obtenerPreguntasDelTema("t1", "Tema");
    limpiarPreguntasEnMemoria("t1");
    await obtenerPreguntasDelTema("t1", "Tema");
    expect(enviar).toHaveBeenCalledTimes(2);
  });
});