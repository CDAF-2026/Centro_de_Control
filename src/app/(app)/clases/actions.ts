"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { createClaseSchema } from "@/lib/validations/clase";
import type { AppRole } from "@/lib/database.types";

const WRITE: AppRole[] = ["superadmin", "coord_admin", "coord_deportivo", "recepcion"];

export type ClaseFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

export async function createClaseIndividual(
  _prev: ClaseFormState,
  formData: FormData,
): Promise<ClaseFormState> {
  await requireRole(WRITE);
  const parsed = createClaseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] = i.message;
    return { error: "Revisa los campos.", fieldErrors };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { data: c, error } = await supabase
    .from("clases")
    .insert({
      tipo: "individual",
      cliente_id: d.clienteId,
      paquete_cliente_id: d.paqueteClienteId ? Number(d.paqueteClienteId) : null,
      profesor_id: d.profesorId || null,
      deporte: d.deporte,
      nivel: d.nivel || null,
      cancha: d.cancha || null,
      fecha: d.fecha,
      hora_inicio: d.horaInicio || null,
      hora_fin: d.horaFin || null,
      precio: d.precio,
      descuento_pct: d.descuento,
      estado: "programada",
    })
    .select("id")
    .single();
  if (error || !c) return { error: error?.message ?? "No se pudo crear la clase." };

  await logAudit({
    action: "clase.create",
    entity: "clases",
    entityId: String(c.id),
    after: { tipo: "individual", fecha: d.fecha },
  });
  revalidatePath("/clases");
  redirect("/clases");
}
