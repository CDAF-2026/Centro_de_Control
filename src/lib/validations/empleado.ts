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
