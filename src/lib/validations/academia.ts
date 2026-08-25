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

/**
 * Nivel del GRUPO, no del niño. Los "Bola Roja / Naranja / Verde / Amarilla" que
 * el club usaba se botaron (decisión de Laura, ago-2026): lo que ordena hoy es
 * edad + nivel, y el cupo sale del nivel. En competencia no hay iniciación — eso
 * lo hace cumplir el trigger `grupo_nivel_valido` de la base, no solo la pantalla.
 */
export const NIVELES_GRUPO = [
  { value: "iniciacion", label: "Iniciación", cupo: 6 },
  { value: "intermedio", label: "Intermedio", cupo: 5 },
  { value: "avanzado", label: "Avanzado", cupo: 4 },
] as const;

/**
 * Nombres sugeridos para bautizar un grupo: personajes de Disney en las
 * recreativas y tenistas famosos en las de competencia (decisión de Laura). Son
 * SUGERENCIAS: el campo es libre y editable, porque el nombre es una etiqueta
 * para hablar del grupo, no un dato del que dependa nada.
 */
export const NOMBRES_SUGERIDOS = {
  recreativa: ["Simba", "Mulán", "Nemo", "Woody", "Elsa", "Moana", "Rayo McQueen", "Dumbo", "Bambi", "Stitch"],
  competencia: ["Federer", "Nadal", "Djokovic", "Serena", "Graf", "Alcaraz", "Sabalenka", "Borg", "Agassi", "Swiatek"],
} as const;

/** Duraciones que usa el club (vistas en los horarios reales de las academias). */
export const DURACIONES = [
  { value: 60, label: "1 hora" },
  { value: 90, label: "1 hora y media" },
  { value: 120, label: "2 horas" },
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
