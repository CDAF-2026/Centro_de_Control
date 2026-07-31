"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import type { AppRole, ServicioCategoriaSaldo } from "@/lib/database.types";

// `config` es solo del superadministrador: escrito a mano dejaba entrar al
// coordinador administrativo aunque la pantalla no le apareciera.
const ADMIN: AppRole[] = rolesForModule("config", "edit");

export type ServicioState = { error?: string; ok?: string };

const CATS: ServicioCategoriaSaldo[] = ["academia", "paquete", "particular"];
function parseCat(v: string): ServicioCategoriaSaldo | null {
  return (CATS as string[]).includes(v) ? (v as ServicioCategoriaSaldo) : null;
}
function slugify(s: string): string {
  const from = "áàäâãéèëêíìïîóòöôõúùüûñç";
  const to = "aaaaaeeeeiiiiooooouuuunc";
  const norm = s
    .toLowerCase()
    .split("")
    .map((ch) => {
      const i = from.indexOf(ch);
      return i >= 0 ? to[i] : ch;
    })
    .join("");
  return norm.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "servicio";
}

export async function createServicio(_prev: ServicioState, formData: FormData): Promise<ServicioState> {
  await requireRole(ADMIN);
  const nombre = String(formData.get("nombre") || "").trim();
  const color = String(formData.get("color") || "").trim() || null;
  const categoria_saldo = parseCat(String(formData.get("categoria_saldo") || ""));
  const orden = Number(formData.get("orden") || 0);
  if (!nombre) return { error: "El nombre es obligatorio." };

  const supabase = await createClient();
  let clave = slugify(nombre);
  const { data: existing } = await supabase.from("servicios").select("clave").eq("clave", clave);
  if (existing && existing.length > 0) clave = `${clave}_${Date.now().toString().slice(-4)}`;

  const { error } = await supabase.from("servicios").insert({ clave, nombre, color, categoria_saldo, orden });
  if (error) return { error: error.message };
  await logAudit({ action: "servicio.create", entity: "servicios", after: { nombre } });
  revalidatePath("/config");
  revalidatePath("/pagos");
  return { ok: "Servicio creado." };
}

export async function updateServicio(_prev: ServicioState, formData: FormData): Promise<ServicioState> {
  await requireRole(ADMIN);
  const id = Number(formData.get("id"));
  const nombre = String(formData.get("nombre") || "").trim();
  const color = String(formData.get("color") || "").trim() || null;
  const categoria_saldo = parseCat(String(formData.get("categoria_saldo") || ""));
  const orden = Number(formData.get("orden") || 0);
  const activo = String(formData.get("activo") ?? "true") !== "false";
  if (!id) return { error: "Servicio inválido." };
  if (!nombre) return { error: "El nombre es obligatorio." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("servicios")
    .update({ nombre, color, categoria_saldo, orden, activo })
    .eq("id", id);
  if (error) return { error: error.message };
  await logAudit({ action: "servicio.update", entity: "servicios", entityId: String(id), after: { nombre, activo } });
  revalidatePath("/config");
  revalidatePath("/pagos");
  return { ok: "Servicio actualizado." };
}

export async function deleteServicio(_prev: ServicioState, formData: FormData): Promise<ServicioState> {
  await requireRole(ADMIN);
  const id = Number(formData.get("id"));
  if (!id) return { error: "Servicio inválido." };

  const supabase = await createClient();
  const { count } = await supabase
    .from("pagos")
    .select("id", { count: "exact", head: true })
    .eq("servicio_id", id);
  if ((count ?? 0) > 0) {
    return { error: `No se puede eliminar: tiene ${count} pago(s) asociados. Desactívalo en su lugar.` };
  }
  const { error } = await supabase.from("servicios").delete().eq("id", id);
  if (error) return { error: error.message };
  await logAudit({ action: "servicio.delete", entity: "servicios", entityId: String(id) });
  revalidatePath("/config");
  revalidatePath("/pagos");
  return { ok: "Servicio eliminado." };
}
