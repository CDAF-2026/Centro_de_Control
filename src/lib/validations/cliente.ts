import { z } from "zod";
import type { AcudienteRol } from "@/lib/database.types";

/** Un bloque de acudiente del formulario (principal o segundo). */
const acudienteCampos = {
  nombre: z.string().trim().optional(),
  documento: z.string().trim().optional(),
  telefono: z.string().trim().optional(),
  email: z.string().trim().email("Correo inválido").optional().or(z.literal("")),
  parentesco: z.string().trim().optional(),
  rol: z.enum(["padre", "madre", "otro"]).optional(),
};

export const createClienteSchema = z.object({
  nombres: z.string().trim().min(2, "Nombres requeridos"),
  apellidos: z.string().trim().min(2, "Apellidos requeridos"),
  documento: z.string().trim().optional(),
  fechaNacimiento: z.string().trim().optional(),
  lugarNacimiento: z.string().trim().optional(),
  direccion: z.string().trim().optional(),
  celular: z.string().trim().optional(),
  email: z.string().trim().email("Email inválido").optional().or(z.literal("")),
  emergenciaNombre: z.string().trim().optional(),
  emergenciaCelular: z.string().trim().optional(),
  emergenciaParentesco: z.string().trim().optional(),
  // Acudiente principal (= clientes.acudiente_id). Obligatorio para menores.
  acudienteNombre: acudienteCampos.nombre,
  acudienteDocumento: acudienteCampos.documento,
  acudienteTelefono: acudienteCampos.telefono,
  acudienteEmail: acudienteCampos.email,
  acudienteParentesco: acudienteCampos.parentesco,
  acudienteRol: acudienteCampos.rol,
  // Segundo acudiente (padre o madre), opcional. Ficha unificada, 1-oct-2026.
  acudiente2Nombre: acudienteCampos.nombre,
  acudiente2Documento: acudienteCampos.documento,
  acudiente2Telefono: acudienteCampos.telefono,
  acudiente2Email: acudienteCampos.email,
  acudiente2Parentesco: acudienteCampos.parentesco,
  acudiente2Rol: acudienteCampos.rol,
});

export type ClienteInput = z.infer<typeof createClienteSchema>;

/** Datos de un acudiente ya limpios para escribir en `acudientes`. */
export type AcudienteDatos = {
  nombre: string;
  documento: string | null;
  telefono: string | null;
  email: string | null;
  parentesco: string | null;
  rol: AcudienteRol;
};

/**
 * Lee los dos bloques de acudiente del formulario. Devuelve null para el bloque
 * que vino sin nombre (un segundo acudiente vacío no se guarda). El rol cae en
 * "otro" si no se escogió, que es lo que tenían las 142 fichas al unificar.
 */
export function leerAcudientes(d: ClienteInput): { principal: AcudienteDatos | null; segundo: AcudienteDatos | null } {
  const arma = (
    nombre?: string, documento?: string, telefono?: string, email?: string, parentesco?: string, rol?: AcudienteRol,
  ): AcudienteDatos | null =>
    nombre
      ? {
          nombre,
          documento: documento || null,
          telefono: telefono || null,
          email: email || null,
          parentesco: parentesco || null,
          rol: rol ?? "otro",
        }
      : null;
  return {
    principal: arma(d.acudienteNombre, d.acudienteDocumento, d.acudienteTelefono, d.acudienteEmail, d.acudienteParentesco, d.acudienteRol),
    segundo: arma(d.acudiente2Nombre, d.acudiente2Documento, d.acudiente2Telefono, d.acudiente2Email, d.acudiente2Parentesco, d.acudiente2Rol),
  };
}

/**
 * Rol a partir del parentesco escrito a mano ("mamá", "Padre", "papa"…). Es la
 * misma regla del backfill de la migración de la ficha unificada; lo que no
 * empiece por "ma"/"pa" es "otro" (abuela, tío, "por confirmar").
 */
export function rolDesdeParentesco(parentesco?: string | null): AcudienteRol {
  const p = (parentesco ?? "").trim().toLowerCase();
  if (/^ma/.test(p)) return "madre";
  if (/^pa/.test(p)) return "padre";
  return "otro";
}

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
