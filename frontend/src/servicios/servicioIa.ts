import type { ConceptoClave, MapaMental, PreguntaEstudio, ResumenTema } from "../tipos";
import { resumenes } from "../datos/resumenes";
import { obtenerPreguntasDelTema } from "../datos/preguntas";
import { mapasMentales, construirMapaMentalRespaldo } from "../datos/mapasMentales";
import { retardoSimulado } from "../utilidades/retardoSimulado";
import { obtenerPreguntasDelTema as obtenerPreguntasConIa, puedeGenerarConIa } from "./servicioPreguntas";

// -----------------------------------------------------------------------
// Datos simulados de Preguntas, Prueba y Mapa conceptual (módulos aún no
// conectados al backend; se implementarán en futuras HU).
// Los RESÚMENES ya no viven aquí: usan services/summaryService.ts, que
// llama al backend FastAPI (POST /api/ai/summaries).
// La API Key del proveedor de IA NUNCA vive en el frontend.
// -----------------------------------------------------------------------

function construirResumenGenerico(idTema: string, titulo: string): ResumenTema {
  return {
    idTema,
    esencial: {
      introduccion: `Este es un resumen esencial generado automáticamente para "${titulo}". Identifica los conceptos que te permitirán comprender rápidamente el resto del material.`,
      conceptosClave: [
        { orden: 1, termino: "Concepto central", definicion: `Idea principal alrededor de la cual se organiza "${titulo}".` },
        { orden: 2, termino: "Definiciones clave", definicion: "Términos específicos que aparecen con frecuencia en el material fuente." },
        { orden: 3, termino: "Relaciones", definicion: "Cómo se conectan los conceptos entre sí dentro del tema." },
      ],
      relaciones: [
        "Los conceptos fundamentales se apoyan entre sí para construir una comprensión general del tema.",
        "El resumen completo profundiza en cada uno de estos conceptos con más detalle.",
      ],
    },
    completo: {
      secciones: [
        {
          subtitulo: "Introducción",
          cuerpo: `El contenido proporcionado sobre "${titulo}" fue analizado para extraer sus ideas principales, definiciones y relaciones entre conceptos.`,
        },
        {
          subtitulo: "Desarrollo",
          cuerpo: "Esta sección se ampliará con los detalles específicos identificados en tu documento o texto a medida que seas evaluado sobre el tema.",
          puntos: ["Concepto fundamental 1", "Concepto fundamental 2", "Concepto fundamental 3"],
        },
      ],
    },
  };
}

function construirPreguntasGenericas(idTema: string, titulo: string): PreguntaEstudio[] {
  // Banco mock para temas creados por el usuario: 12 preguntas (4 fáciles,
  // 5 medias, 3 difíciles) con ids estables para poder registrar su estado.
  const especificaciones: Array<[PreguntaEstudio["dificultad"], string, string, string]> = [
    ["facil", `¿Cuál describe mejor la idea central de "${titulo}"?`, "La idea principal identificada en el material", "Un detalle sin relación con el tema"],
    ["facil", `¿Qué se espera lograr al estudiar "${titulo}"?`, "Comprender sus conceptos fundamentales", "Memorizar sin entender"],
    ["facil", `¿Dónde conviene empezar para estudiar "${titulo}"?`, "Por el resumen esencial", "Por los detalles más específicos"],
    ["facil", `¿Qué tipo de contenido organiza "${titulo}"?`, "Conceptos, definiciones y relaciones", "Únicamente fechas"],
    ["media", `¿Cómo se relacionan los conceptos principales de "${titulo}"?`, "Se apoyan entre sí para formar una visión general", "Son completamente independientes"],
    ["media", `¿Qué aporta el mapa conceptual de "${titulo}"?`, "Una vista de cómo se conectan las ideas", "Una lista alfabética de términos"],
    ["media", `¿Para qué sirven las preguntas de práctica de "${titulo}"?`, "Para detectar qué conceptos aún no dominas", "Para reemplazar la lectura del resumen"],
    ["media", `¿Qué conviene hacer tras fallar una pregunta sobre "${titulo}"?`, "Leer la explicación y repasar el concepto", "Ignorarla y continuar"],
    ["media", `¿Qué diferencia un concepto fundamental de uno secundario en "${titulo}"?`, "El fundamental sostiene la comprensión de los demás", "El secundario siempre es más importante"],
    ["dificil", `¿Qué estrategia consolida mejor lo aprendido sobre "${titulo}"?`, "Combinar lectura, práctica y autoevaluación", "Releer el mismo párrafo muchas veces"],
    ["dificil", `¿Qué indica un dominio alto en "${titulo}"?`, "Aciertos sostenidos, incluso en preguntas difíciles", "Haber respondido una sola pregunta"],
    ["dificil", `Ante un error repetido en "${titulo}", ¿qué es lo más efectivo?`, "Identificar el concepto de fondo y reforzarlo", "Cambiar de tema inmediatamente"],
  ];
  return especificaciones.map(([dificultad, enunciado, correcta, erronea], i) => {
    const correctaPrimero = i % 2 === 0;
    return {
      id: `${idTema}-g${i + 1}`,
      idTema,
      enunciado,
      tipo: "opcion-multiple" as const,
      dificultad,
      opciones: [
        { id: "a", etiqueta: correctaPrimero ? correcta : erronea },
        { id: "b", etiqueta: correctaPrimero ? erronea : correcta },
        { id: "c", etiqueta: "Ninguna de las anteriores" },
        { id: "d", etiqueta: "Todas las anteriores" },
      ],
      idOpcionCorrecta: correctaPrimero ? "a" : "b",
      explicacion: "Pregunta de ejemplo generada automáticamente. Con tu material real, la IA generará preguntas específicas del contenido.",
    };
  });
}

export async function generarPreguntas(idTema: string, titulo = "este tema"): Promise<PreguntaEstudio[]> {
  // MOD-03: con resumen general disponible, las preguntas las genera la IA (backend). Sin resumen, banco local.
  if (puedeGenerarConIa(idTema)) return obtenerPreguntasConIa(idTema, titulo);
  const existente = obtenerPreguntasDelTema(idTema);
  const resultado = existente.length > 0 ? existente : construirPreguntasGenericas(idTema, titulo);
  return retardoSimulado(resultado, 1000);
}

export async function generarMapaMental(idTema: string, titulo = "Tema"): Promise<MapaMental> {
  const existente = mapasMentales[idTema];
  if (existente) return retardoSimulado(existente, 900);

  const resumen = resumenes[idTema];
  const conceptos = resumen
    ? resumen.esencial.conceptosClave.map((c) => ({ termino: c.termino, definicion: c.definicion }))
    : [
        { termino: "Concepto 1", definicion: "Generado automáticamente" },
        { termino: "Concepto 2", definicion: "Generado automáticamente" },
        { termino: "Concepto 3", definicion: "Generado automáticamente" },
      ];

  return retardoSimulado(construirMapaMentalRespaldo(idTema, titulo, conceptos), 900);
}

/** Conceptos clave del tema (resumen) — alimenta "Conceptos relacionados". */
export async function obtenerConceptosTema(idTema: string, titulo = "este tema"): Promise<{ conceptos: ConceptoClave[]; resumen: ResumenTema }> {
  const resumen = resumenes[idTema] ?? construirResumenGenerico(idTema, titulo);
  return retardoSimulado({ conceptos: resumen.esencial.conceptosClave, resumen }, 250);
}
