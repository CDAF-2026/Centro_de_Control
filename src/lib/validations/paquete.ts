import { z } from "zod";

export const createCatalogoSchema = z.object({
  nombre: z.string().trim().min(2, "Nombre requerido"),
  deporte: z.enum(["tenis", "padel"]).optional().or(z.literal("")),
  numClases: z.coerce.number().int().positive("Debe ser > 0"),
  precio: z.coerce.number().int().min(0).default(0),
  descuento: z.coerce.number().min(0).max(100).default(0),
});

export const updateCatalogoSchema = createCatalogoSchema.extend({
  id: z.coerce.number().int().positive(),
});

/** Precio final tras aplicar el descuento (redondeado). */
export function precioFinal(precio: number, descuentoPct: number): number {
  return Math.round(precio * (1 - (descuentoPct || 0) / 100));
}
