import { describe, expect, it } from "vitest";
import { MAX_RESPUESTAS_POR_TEMA, MAX_SEGUNDOS_POR_RESPUESTA, anadirRespuestas, calcularRendimiento, respuestasDeRevision, segundosEntre, unirRespuestas, type RespuestaRegistrada } from "./rendimiento";

const r = (correcta: boolean, dificultad: RespuestaRegistrada["dificultad"] = "media", segundos: number | null = null, at = 0): RespuestaRegistrada => ({ dificultad, correcta, segundos, origen: "practica", at });

describe("calcularRendimiento", () => {
  it("sin respuestas todo está en cero y sin porcentajes", () => {
    const x = calcularRendimiento([]);
    expect(x).toMatchObject({ total: 0, correctas: 0, porcentajeAcumulado: null, rachaActual: 0, mejorRacha: 0, tiempoMedioSegundos: null });
    expect(x.porDificultad.facil).toEqual({ preguntas: 0, correctas: 0, porcentaje: null, tiempoMedioSegundos: null });
  });

  it("cuenta por dificultad y calcula el porcentaje acumulado", () => {
    const x = calcularRendimiento([r(true, "facil"), r(true, "facil"), r(false, "media"), r(true, "media"), r(false, "dificil")]);
    expect(x.total).toBe(5);
    expect(x.correctas).toBe(3);
    expect(x.porcentajeAcumulado).toBe(0.6);
    expect(x.porDificultad.facil).toMatchObject({ preguntas: 2, correctas: 2, porcentaje: 1 });
    expect(x.porDificultad.media).toMatchObject({ preguntas: 2, correctas: 1, porcentaje: 0.5 });
    expect(x.porDificultad.dificil).toMatchObject({ preguntas: 1, correctas: 0, porcentaje: 0 });
  });

  it("calcula la racha actual y la mejor racha", () => {
    const x = calcularRendimiento([r(true), r(true), r(true), r(false), r(true), r(true)]);
    expect(x.mejorRacha).toBe(3);
    expect(x.rachaActual).toBe(2);
    expect(calcularRendimiento([r(true), r(false)]).rachaActual).toBe(0);
  });

  it("el tiempo medio ignora las respuestas sin tiempo (pruebas)", () => {
    const x = calcularRendimiento([r(true, "facil", 10), r(true, "facil", 20), r(true, "media", null)]);
    expect(x.tiempoMedioSegundos).toBe(15);
    expect(x.porDificultad.facil.tiempoMedioSegundos).toBe(15);
    expect(x.porDificultad.media.tiempoMedioSegundos).toBeNull();
  });
});

describe("registro de respuestas", () => {
  it("anadirRespuestas no muta la lista anterior", () => {
    const base = [r(true)];
    expect(anadirRespuestas(base, [r(false)])).toHaveLength(2);
    expect(base).toHaveLength(1);
  });

  it("al superar el tope descarta las más antiguas", () => {
    const lista = anadirRespuestas(Array.from({ length: MAX_RESPUESTAS_POR_TEMA }, () => r(false)), [r(true, "media", null, 77)]);
    expect(lista).toHaveLength(MAX_RESPUESTAS_POR_TEMA);
    expect(lista[lista.length - 1].at).toBe(77);
  });

  it("unirRespuestas ordena por momento", () => {
    expect(unirRespuestas([[r(true, "media", null, 5), r(true, "media", null, 1)], [r(false, "media", null, 3)]]).map((x) => x.at)).toEqual([1, 3, 5]);
  });

  it("respuestasDeRevision omite las preguntas sin responder", () => {
    const x = respuestasDeRevision([
      { dificultad: "facil", estado: "correcta" },
      { dificultad: "media", estado: "incorrecta" },
      { dificultad: "dificil", estado: "omitida" },
    ]);
    expect(x).toEqual([
      { dificultad: "facil", correcta: true, segundos: null, origen: "prueba" },
      { dificultad: "media", correcta: false, segundos: null, origen: "prueba" },
    ]);
  });

  it("segundosEntre redondea a un decimal y limita los extremos", () => {
    expect(segundosEntre(0, 12_340)).toBe(12.3);
    expect(segundosEntre(5_000, 1_000)).toBe(0);
    expect(segundosEntre(0, 3_600_000)).toBe(MAX_SEGUNDOS_POR_RESPUESTA);
  });
});
