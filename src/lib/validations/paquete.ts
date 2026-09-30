import { z } from "zod";

// El catálogo NO lleva precio: cada cliente paga un valor distinto por el mismo
// paquete, y ese valor se digita al asignarlo (ver `precioAsignacionSchema`).
export const createCatalogoSchema = z.object({
  nombre: z.string().trim().min(2, "Nombre requerido"),
  deporte: z.enum(["tenis", "padel"]).optional().or(z.literal("")),
  numClases: z.coerce.number().int().positive("Debe ser > 0"),
});

export const updateCatalogoSchema = createCatalogoSchema.extend({
  id: z.coerce.number().int().positive(),
});

/** Precio que paga el cliente por el paquete: obligatorio y nunca cero. */
export const precioAsignacionSchema = z.coerce
  .number({ message: "Escribe el precio del paquete." })
  .int("El precio va en pesos, sin decimales.")
  .positive("El precio del paquete es obligatorio y no puede ser cero.");
