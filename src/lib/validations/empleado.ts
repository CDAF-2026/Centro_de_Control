import { z } from "zod";

export const STAFF_ROLES = [
  "superadmin",
  "coord_admin",
  "coord_deportivo",
  "recepcion",
  "profesor",
] as const;

export const createEmpleadoSchema = z
  .object({
    nombre: z.string().trim().min(2, "Nombre requerido"),
    email: z.string().trim().email("Email inválido"),
    password: z.string().min(8, "Mínimo 8 caracteres"),
    documento: z.string().trim().optional(),
    telefono: z.string().trim().optional(),
    role: z.enum(STAFF_ROLES),
    valorClase: z.string().trim().optional(),
  })
  .refine(
    (d) => d.role !== "profesor" || (!!d.valorClase && /^\d+$/.test(d.valorClase)),
    { message: "Valor de clase (número en COP) requerido para profesores", path: ["valorClase"] },
  );

export const updateEmpleadoSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string().trim().min(2, "Nombre requerido"),
  email: z.string().trim().email("Email inválido").optional().or(z.literal("")),
  documento: z.string().trim().optional(),
  telefono: z.string().trim().optional(),
});

export const valorClaseSchema = z.object({
  profesorId: z.string().uuid(),
  valor: z.coerce.number().int().min(0, "Valor inválido"),
});

// ── Reglas de compensación por entrenador (modelo flexible) ──
export const reglaEscalonSchema = z.object({
  min: z.coerce.number().int().min(1),
  valor: z.coerce.number().int().min(0),
});

const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export const reglaSchema = z
  .object({
    nombre: z.string().trim().min(1, "Ponle un nombre a la regla"),
    concepto: z.enum(["clase_particular", "paquete", "academia", "siigo", "clase", "salario"]),
    metodo: z.enum([
      "pct_facturado",
      "fijo_por_clase",
      "escalonado_asistentes",
      "por_alumno",
      "pct_siigo_servicio",
      "salario_fijo",
    ]),
    pct: z.coerce.number().min(0).max(100).default(0),
    valor: z.coerce.number().int().min(0).default(0),
    servicio_id: z.coerce.number().int().nullable().default(null),
    escalones: z.array(reglaEscalonSchema).nullable().default(null),
    dias: z.array(z.coerce.number().int().min(0).max(6)).nullable().default(null),
    hora_desde: z.string().regex(HORA_RE, "Hora inválida").nullable().default(null),
    hora_hasta: z.string().regex(HORA_RE, "Hora inválida").nullable().default(null),
  })
  .refine((r) => r.metodo !== "pct_siigo_servicio" || r.servicio_id != null, {
    message: "Elige el servicio de Siigo para la regla de alto rendimiento",
    path: ["servicio_id"],
  })
  .refine((r) => r.metodo !== "escalonado_asistentes" || (!!r.escalones && r.escalones.length > 0), {
    message: "Agrega al menos un escalón",
    path: ["escalones"],
  })
  .refine((r) => r.metodo !== "salario_fijo" || r.valor > 0, {
    message: "Ponle un valor al salario fijo",
    path: ["valor"],
  });

export const reglasSchema = z.array(reglaSchema);
