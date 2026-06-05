import { z } from "zod";

export const createClaseSchema = z.object({
  clienteId: z.coerce.number().int().positive("Cliente requerido"),
  profesorId: z.string().uuid().optional().or(z.literal("")),
  deporte: z.enum(["tenis", "padel"]),
  nivel: z.string().trim().optional(),
  cancha: z.string().trim().optional(),
  fecha: z.string().min(1, "Fecha requerida"),
  horaInicio: z.string().trim().optional(),
  horaFin: z.string().trim().optional(),
  precio: z.coerce.number().int().min(0).default(0),
  descuento: z.coerce.number().min(0).max(100).default(0),
});
