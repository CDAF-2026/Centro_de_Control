"use server";

import Papa from "papaparse";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { esMenorDeEdad } from "@/lib/validations/cliente";
import type { AppRole } from "@/lib/database.types";

const WRITE_ROLES: AppRole[] = ["superadmin", "coord_admin", "recepcion"];

export type ImportState = {
  done?: boolean;
  creados?: number;
  total?: number;
  errores?: { fila: number; motivo: string }[];
  error?: string;
};

function normalizarFecha(s?: string): string | null {
  const t = (s ?? "").trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // DD/MM/AAAA
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return t;
}

export async function importarClientesCsv(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  await requireRole(WRITE_ROLES);

  const file = formData.get("archivo");
  if (!(file instanceof File) || file.size === 0) return { error: "Selecciona un archivo .csv." };
  if (file.size > 5 * 1024 * 1024) return { error: "El archivo supera 5 MB." };

  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  const rows = parsed.data ?? [];
  if (rows.length === 0) return { error: "El CSV no tiene filas de datos." };

  const supabase = await createClient();
  const errores: { fila: number; motivo: string }[] = [];
  let creados = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const fila = i + 2; // fila 1 = encabezado
    const nombres = (r.nombres ?? "").trim();
    const apellidos = (r.apellidos ?? "").trim();
    if (!nombres || !apellidos) {
      errores.push({ fila, motivo: "Falta nombres o apellidos" });
      continue;
    }

    const fecha = normalizarFecha(r.fecha_nacimiento);
    const menor = esMenorDeEdad(fecha);
    const acuNombre = (r.acudiente_nombre ?? "").trim();
    if (menor && !acuNombre) {
      errores.push({ fila, motivo: "Menor de edad: falta acudiente_nombre" });
      continue;
    }

    let acudienteId: number | null = null;
    if (menor) {
      const { data: ac, error: ae } = await supabase
        .from("acudientes")
        .insert({
          nombre: acuNombre,
          documento: r.acudiente_documento || null,
          telefono: r.acudiente_telefono || null,
          parentesco: r.acudiente_parentesco || null,
        })
        .select("id")
        .single();
      if (ae || !ac) {
        errores.push({ fila, motivo: `Acudiente: ${ae?.message ?? "error"}` });
        continue;
      }
      acudienteId = ac.id;
    }

    const { error: ce } = await supabase.from("clientes").insert({
      nombres,
      apellidos,
      documento: r.documento || null,
      fecha_nacimiento: fecha,
      es_menor: menor,
      celular: r.celular || null,
      email: r.email || null,
      emergencia_nombre: r.emergencia_nombre || null,
      emergencia_celular: r.emergencia_celular || null,
      emergencia_parentesco: r.emergencia_parentesco || null,
      acudiente_id: acudienteId,
    });
    if (ce) {
      errores.push({ fila, motivo: ce.message });
      continue;
    }
    creados++;
  }

  await logAudit({
    action: "cliente.import_csv",
    entity: "clientes",
    after: { creados, total: rows.length, errores: errores.length },
  });
  revalidatePath("/clientes");
  return { done: true, creados, total: rows.length, errores };
}
