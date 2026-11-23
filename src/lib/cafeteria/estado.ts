/**
 * En qué va un pedido de la cafetería (Laura, 20-nov-2026). Nace `pendiente` y
 * la cafetería lo va moviendo desde `/cafeteria/pedidos`.
 *
 * Dos listas, para que no se confundan:
 *   · "Por atender": lo de HOY que sigue pendiente o en preparación.
 *   · "Historial": lo entregado, lo cancelado y TODO lo de días anteriores, esté
 *     como esté. Cada día la lista por atender arranca vacía.
 *
 * El `check` de la columna y la función `cafeteria_pedido_estado` repiten estos
 * mismos cuatro valores: al agregar uno hay que tocar los tres sitios.
 */
export const ESTADOS = [
  { id: "pendiente", nombre: "Pendiente" },
  { id: "en_preparacion", nombre: "En preparación" },
  { id: "entregado", nombre: "Entregado" },
  { id: "cancelado", nombre: "Cancelado" },
] as const;

export type EstadoPedido = (typeof ESTADOS)[number]["id"];

/** Los estados que mantienen un pedido de hoy en la lista por atender. */
export const POR_ATENDER: EstadoPedido[] = ["pendiente", "en_preparacion"];

export function esEstado(valor: unknown): valor is EstadoPedido {
  return ESTADOS.some((e) => e.id === valor);
}

export function nombreEstado(estado: string): string {
  return ESTADOS.find((e) => e.id === estado)?.nombre ?? estado;
}

/** ¿Un pedido en este estado sigue por atender (si es de hoy)? */
export function sigueAbierto(estado: string): boolean {
  return (POR_ATENDER as string[]).includes(estado);
}
