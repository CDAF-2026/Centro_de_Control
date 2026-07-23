import type { TipoDocumento } from "@/lib/database.types";

/**
 * Lógica pura del documento de identidad, SIN "use client": la usan tanto la
 * ficha (componente de servidor) como el formulario (cliente). Si esto viviera
 * en documento-field.tsx ("use client"), el servidor no podría llamar
 * documentoLegible() — solo renderizar componentes cliente, no invocar sus
 * funciones.
 */

/** Etiquetas de los tipos de documento, en el orden en que se muestran. */
export const TIPOS_DOCUMENTO: { valor: TipoDocumento; etiqueta: string }[] = [
  { valor: "CC", etiqueta: "CC · Cédula" },
  { valor: "TI", etiqueta: "TI · Tarjeta de identidad" },
  { valor: "CE", etiqueta: "CE · Cédula de extranjería" },
  { valor: "PP", etiqueta: "PP · Pasaporte" },
  { valor: "NIT", etiqueta: "NIT" },
];

/** Texto corto para mostrar el documento en la ficha: "CC 43627696". */
export function documentoLegible(tipo: string | null, numero: string | null): string | null {
  if (!numero) return null;
  return tipo ? `${tipo} ${numero}` : numero;
}
