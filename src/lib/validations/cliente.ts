import { z } from "zod";

export const createClienteSchema = z.object({
  nombres: z.string().trim().min(2, "Nombres requeridos"),
  apellidos: z.string().trim().min(2, "Apellidos requeridos"),
  documento: z.string().trim().optional(),
  fechaNacimiento: z.string().trim().optional(),
  celular: z.string().trim().optional(),
  email: z.string().trim().email("Email inválido").optional().or(z.literal("")),
  contactoEmergencia: z.string().trim().optional(),
  acudienteNombre: z.string().trim().optional(),
  acudienteDocumento: z.string().trim().optional(),
  acudienteTelefono: z.string().trim().optional(),
  acudienteParentesco: z.string().trim().optional(),
});

/** Edad en años a partir de una fecha yyyy-mm-dd (o null si inválida). */
export function edadDesde(fecha?: string | null): number | null {
  if (!fecha) return null;
  const n = new Date(`${fecha}T00:00:00`);
  if (Number.isNaN(n.getTime())) return null;
  const h = new Date();
  let edad = h.getFullYear() - n.getFullYear();
  const m = h.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && h.getDate() < n.getDate())) edad--;
  return edad;
}

export function esMenorDeEdad(fecha?: string | null): boolean {
  const e = edadDesde(fecha);
  return e != null && e < 18;
}
