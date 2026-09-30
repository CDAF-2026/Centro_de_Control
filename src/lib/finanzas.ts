/**
 * Cálculos financieros compartidos (ficha de cliente + dashboard).
 * Fuente única de verdad para que los saldos coincidan en toda la app.
 */

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
