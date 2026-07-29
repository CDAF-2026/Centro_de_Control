import { z } from "zod";

/**
 * Una academia es un SERVICIO (recreativa/competencia × tenis/pádel), no un grupo.
 * El horario, el profesor y la cancha ya no viven aquí: bajan al horario de cada
 * inscrito, porque un niño puede ir martes 16:30 con un profe y sábado 12:00 con
 * otro. Y el ingreso sale de Siigo (`servicioId`), no de `precio`.
 */
export const createAcademiaSchema = z.object({
  nombre: z.string().trim().min(2, "Nombre requerido"),
  deporte: z.enum(["tenis", "padel"]),
  categoria: z.enum(["recreativa", "competencia"]),
  /** id del servicio de Siigo; llega del select como string ("" = sin atar). */
  servicioId: z.string().trim().optional(),
  /** Solo referencia para quien contesta el teléfono. NO se usa para calcular. */
  precio: z.coerce.number().int().min(0).default(0),
  matricula: z.coerce.number().int().min(0).default(0),
});

export const CATEGORIAS = [
  { value: "recreativa", label: "Recreativa" },
  { value: "competencia", label: "Competencia" },
] as const;

export const DIAS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mié" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
  { value: 6, label: "Sáb" },
  { value: 0, label: "Dom" },
];
