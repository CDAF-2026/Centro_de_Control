import { z } from "zod";

export const createAcademiaSchema = z.object({
  nombre: z.string().trim().min(2, "Nombre requerido"),
  deporte: z.enum(["tenis", "padel"]),
  nivel: z.string().trim().optional(),
  profesorId: z.string().uuid().optional().or(z.literal("")),
  cancha: z.string().trim().optional(),
  precio: z.coerce.number().int().min(0).default(0),
  matricula: z.coerce.number().int().min(0).default(0),
  periodoInicio: z.string().trim().optional(),
  periodoFin: z.string().trim().optional(),
  horaInicio: z.string().trim().optional(),
  horaFin: z.string().trim().optional(),
});

export const DIAS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mié" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
  { value: 6, label: "Sáb" },
  { value: 0, label: "Dom" },
];
