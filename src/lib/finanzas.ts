/**
 * Cálculos financieros compartidos (ficha de cliente + dashboard).
 * Fuente única de verdad para que los saldos coincidan en toda la app.
 */

/** Valor de un paquete asignado = precio final del catálogo (con su descuento)
 *  menos el descuento de la asignación. */
export function valorPaquete(
  catalogoPrecio: number,
  catalogoDescPct: number,
  asignacionDescPct: number,
): number {
  const base = Math.round((catalogoPrecio || 0) * (1 - (catalogoDescPct || 0) / 100));
  return Math.round(base * (1 - (asignacionDescPct || 0) / 100));
}

/** Imputabilidad de un pago a un servicio que genera saldo (academia/paquete).
 *  Se basa en la etiqueta de texto del servicio (respaldo histórico). El catálogo
 *  de servicios (categoria_saldo) es la fuente nueva; esto cubre filas antiguas. */
export function clasificarServicioPago(servicio: string): "academia" | "paquete" | "particular" | "otro" {
  const s = servicio.toLowerCase();
  if (s.startsWith("academia")) return "academia";
  if (s.startsWith("paquete")) return "paquete";
  if (s.includes("clase particular")) return "particular";
  return "otro";
}

/**
 * Color por defecto para un servicio sin color asignado en el catálogo, y color del
 * cubo "Otros" de la dona. Es un gris neutro A PROPÓSITO: no compite con los colores
 * de identidad y se lee como "esto no es una categoría, es el resto".
 * Verificado que se despega de los 7 de la dona (peor par ΔE 15,5 con visión normal).
 */
export const COLOR_SERVICIO_DEFAULT = "#b9bdb6";
