/**
 * Lo que viaja entre la ruta `/agente/chat` y la pantalla: una línea JSON por
 * evento (NDJSON), para que la respuesta se vea mientras se escribe.
 *
 * Va sin "server-only": lo usan el servidor y el navegador. Lo que NO viaja a
 * propósito: el modelo que respondió, los nombres internos de las herramientas y
 * el costo (decisión de Laura, 24-nov-2026: el reparto entre modelos es invisible).
 */

export type FuenteVista = { fuente: string; periodo?: string };

export type MensajeVista = {
  id: number;
  rol: "usuario" | "agente";
  contenido: string;
  /** De dónde salieron las cifras ("Cómo lo calculé"). Vacío en las preguntas. */
  fuentes: FuenteVista[];
  created_at: string;
};

export type LineaChat =
  | { tipo: "inicio"; conversacionId: number; pregunta: MensajeVista }
  /** Qué está consultando ahora ("Revisando la cartera…"). */
  | { tipo: "consultando"; etiqueta: string }
  | { tipo: "texto"; delta: string }
  | { tipo: "texto_descartado" }
  | { tipo: "fin"; respuesta: MensajeVista }
  | { tipo: "error"; mensaje: string };

export function codificar(linea: LineaChat): string {
  return `${JSON.stringify(linea)}\n`;
}

/** Arma líneas completas a partir de pedazos que pueden cortar una línea por la mitad. */
export class LectorLineas {
  private resto = "";

  agregar(pedazo: string): LineaChat[] {
    this.resto += pedazo;
    const partes = this.resto.split("\n");
    this.resto = partes.pop() ?? "";
    return partes.filter((p) => p.trim()).map((p) => JSON.parse(p) as LineaChat);
  }

  /** Lo que quedó sin salto de línea al cerrar el flujo. */
  terminar(): LineaChat[] {
    const r = this.resto.trim();
    this.resto = "";
    return r ? [JSON.parse(r) as LineaChat] : [];
  }
}

/**
 * Las fuentes de una respuesta a partir de lo que consultó el agente: solo las
 * consultas que salieron bien, sin repetir. Es lo que se muestra en "Cómo lo calculé".
 */
export function fuentesDe(herramientas: unknown): FuenteVista[] {
  if (!Array.isArray(herramientas)) return [];
  const vistas = new Map<string, FuenteVista>();
  for (const h of herramientas as { ok?: boolean; fuente?: string; periodo?: string }[]) {
    if (!h?.ok || !h.fuente) continue;
    const clave = `${h.fuente}|${h.periodo ?? ""}`;
    if (!vistas.has(clave)) vistas.set(clave, { fuente: h.fuente, ...(h.periodo ? { periodo: h.periodo } : {}) });
  }
  return [...vistas.values()];
}
