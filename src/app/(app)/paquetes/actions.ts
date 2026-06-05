"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { createCatalogoSchema } from "@/lib/validations/paquete";

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
  });
  if (error) return { error: error.message };

  await logAudit({ action: "paquete.catalogo.create", entity: "paquetes_catalogo", after: { nombre: d.nombre, num_clases: d.numClases } });
  revalidatePath("/paquetes");
  return { ok: "Paquete agregado al catálogo." };
}
