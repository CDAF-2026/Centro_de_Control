import type { TipoDocumento, Rh } from "@/lib/database.types";

/**
 * Lógica pura del documento de identidad, SIN "use client": la usan tanto la
 * ficha (componente de servidor) como el formulario (cliente). Si esto viviera
 * en documento-field.tsx ("use client"), el servidor no podría llamar
 * documentoLegible() — solo renderizar componentes cliente, no invocar sus
 * funciones.
 */

/** Etiquetas de los tipos de documento, en orden de edad + extranjeros + jurídica. */
export const TIPOS_DOCUMENTO: { valor: TipoDocumento; etiqueta: string }[] = [
  { valor: "RC", etiqueta: "RC · Registro civil" },
  { valor: "TI", etiqueta: "TI · Tarjeta de identidad" },
  { valor: "CC", etiqueta: "CC · Cédula" },
  { valor: "CE", etiqueta: "CE · Cédula de extranjería" },
  { valor: "PP", etiqueta: "PP · Pasaporte" },
  { valor: "PPT", etiqueta: "PPT · Permiso protección temporal" },
  { valor: "NIT", etiqueta: "NIT" },
];

/** Grupos sanguíneos válidos (ABO × Rh), para el selector de RH. */
export const RH_VALORES: Rh[] = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"];

/**
 * Tipo de documento sugerido por la edad, según la norma colombiana:
 * registro civil hasta los 6, tarjeta de identidad de 7 a 17, cédula desde 18.
 * Es solo una sugerencia por defecto; en la ficha se puede corregir.
 */
export function tipoDocumentoPorEdad(edad: number | null): TipoDocumento | null {
  if (edad == null) return null;
  if (edad < 7) return "RC";
  if (edad < 18) return "TI";
  return "CC";
}

/** Texto corto para mostrar el documento en la ficha: "CC 43627696". */
export function documentoLegible(tipo: string | null, numero: string | null): string | null {
  if (!numero) return null;
  return tipo ? `${tipo} ${numero}` : numero;
}
