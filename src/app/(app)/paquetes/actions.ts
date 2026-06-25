"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { createCatalogoSchema, updateCatalogoSchema } from "@/lib/validations/paquete";

export type PaqueteFormState = {
  error?: string;
  ok?: string;
  fieldErrors?: Record<string, string>;
};

/** Crea un paquete en el catálogo (config). Solo SA/CA. */
export async function createCatalogo(
  _prev: PaqueteFormState,
  formData: FormData,
): Promise<PaqueteFormState> {
  await requireRole(["superadmin", "coord_admin"]);
  const parsed = createCatalogoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] = i.message;
    return { error: "Revisa los campos.", fieldErrors };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("paquetes_catalogo").insert({
    nombre: d.nombre,
    deporte: d.deporte || null,
    num_clases: d.numClases,
    precio: d.precio,
    descuento_pct: d.descuento,
  });
  if (error) return { error: error.message };

  await logAudit({ action: "paquete.catalogo.create", entity: "paquetes_catalogo", after: { nombre: d.nombre, num_clases: d.numClases } });
  revalidatePath("/paquetes");
  return { ok: "Paquete agregado al catálogo." };
}

/** Edita un paquete del catálogo. Solo SA/CA. */
export async function updateCatalogo(
  _prev: PaqueteFormState,
  formData: FormData,
): Promise<PaqueteFormState> {
  await requireRole(["superadmin", "coord_admin"]);
  const parsed = updateCatalogoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] = i.message;
    return { error: "Revisa los campos.", fieldErrors };
  }
  const d = parsed.data;
  const activo = String(formData.get("activo") ?? "true") !== "false";

  const supabase = await createClient();
  const { error } = await supabase
    .from("paquetes_catalogo")
    .update({
      nombre: d.nombre,
      deporte: d.deporte || null,
      num_clases: d.numClases,
      precio: d.precio,
      descuento_pct: d.descuento,
      activo,
    })
    .eq("id", d.id);
  if (error) return { error: error.message };

  await logAudit({ action: "paquete.catalogo.update", entity: "paquetes_catalogo", entityId: String(d.id), after: { nombre: d.nombre, precio: d.precio, descuento_pct: d.descuento, activo } });
  revalidatePath("/paquetes");
  return { ok: "Paquete actualizado." };
}

/**
 * Elimina un paquete del catálogo. Solo SA/CA.
 * Se bloquea si ya está asignado a clientes (preserva su historial); en ese caso
 * conviene desactivarlo en vez de borrarlo.
 */
export async function deleteCatalogo(
  _prev: PaqueteFormState,
  formData: FormData,
): Promise<PaqueteFormState> {
  await requireRole(["superadmin", "coord_admin"]);
  const id = Number(formData.get("id"));
  if (!id) return { error: "Paquete inválido." };

  const supabase = await createClient();
  const { count } = await supabase
    .from("paquetes_cliente")
    .select("id", { count: "exact", head: true })
    .eq("catalogo_id", id);
  if ((count ?? 0) > 0) {
    return {
      error: `No se puede eliminar: está asignado a ${count} cliente(s). Desactívalo en su lugar.`,
    };
  }

  const { error } = await supabase.from("paquetes_catalogo").delete().eq("id", id);
  if (error) return { error: error.message };

  await logAudit({ action: "paquete.catalogo.delete", entity: "paquetes_catalogo", entityId: String(id) });
  revalidatePath("/paquetes");
  return { ok: "Paquete eliminado." };
}
