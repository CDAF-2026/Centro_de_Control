import { z } from "zod";

export const createCatalogoSchema = z.object({
  nombre: z.string().trim().min(2, "Nombre requerido"),
  deporte: z.enum(["tenis", "padel"]).optional().or(z.literal("")),
  numClases: z.coerce.number().int().positive("Debe ser > 0"),
  precio: z.coerce.number().int().min(0).default(0),
});
