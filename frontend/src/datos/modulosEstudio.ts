import { FileText, ListChecks, MessageCircleQuestion, Network, type LucideIcon } from "lucide-react";

export type IdModulo = "resumen" | "preguntas" | "prueba" | "mapa-mental";

export interface ModuloEstudio {
  id: IdModulo;
  /** Segmento de la URL: /estudio/:id/<ruta>. */
  ruta: string;
  etiqueta: string;
  /** Una línea que ayuda a identificar el módulo. */
  proposito: string;
  icono: LucideIcon;
  /** Color funcional del módulo (ver estudio.css). */
  tono: "azul" | "naranja" | "verde" | "morado";
}

// Iconografía definida en las propuestas visuales: documento · interrogación en burbuja · checklist · nodos conectados.
export const MODULOS_ESTUDIO: readonly ModuloEstudio[] = [
  { id: "resumen", ruta: "resumen", etiqueta: "Resumen", proposito: "Lee las ideas clave", icono: FileText, tono: "azul" },
  { id: "preguntas", ruta: "preguntas", etiqueta: "Preguntas", proposito: "Practica con preguntas", icono: MessageCircleQuestion, tono: "naranja" },
  { id: "prueba", ruta: "prueba", etiqueta: "Prueba", proposito: "Ponte a prueba", icono: ListChecks, tono: "verde" },
  { id: "mapa-mental", ruta: "mapa-mental", etiqueta: "Mapa conceptual", proposito: "Visualiza las relaciones", icono: Network, tono: "morado" },
];

/** Módulo al que pertenece un segmento de ruta (la pantalla de resultados forma parte de Prueba). */
export function moduloDesdeSegmento(segmento: string | undefined): ModuloEstudio | undefined {
  if (!segmento) return undefined;
  const ruta = segmento === "resultados" ? "prueba" : segmento;
  return MODULOS_ESTUDIO.find((m) => m.ruta === ruta);
}
