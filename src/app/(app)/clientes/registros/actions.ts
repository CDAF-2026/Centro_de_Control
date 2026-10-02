"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PUEDE_REVISAR_REGISTROS } from "@/lib/registro/revision";
import { reatribuirFacturas } from "@/lib/facturacion";
import { logAudit } from "@/lib/audit";
import type { Json } from "@/lib/database.types";

export type RevisionState = { error?: string; ok?: string };

/**
 * La bandeja del registro por QR (plan §4.10). Cada acción revalida el rol
 * (handoff §1.12): la página no protege la server action. Las funciones de la
 * base lo vuelven a exigir por dentro.
 */

/** Aprueba o rechaza UN cambio de facturación. Aprobar un NIT re-engancha facturas: con sesión, nunca desde el camino público. */
export async function decidirCambio(_prev: RevisionState, formData: FormData): Promise<RevisionState> {
  await requireRole(PUEDE_REVISAR_REGISTROS);
  const id = Number(formData.get("cambioId"));
  const aprobar = String(formData.get("decision")) === "aprobar";
  if (!id) return { error: "Cambio inválido." };

  const supabase = await createClient();
  const { data: cambio } = await supabase.from("registro_cambio").select("cliente_id, campo, valor_nuevo").eq("id", id).maybeSingle();
  if (!cambio) return { error: "El cambio no existe o ya fue decidido." };

  const { error } = await supabase.rpc("registro_cambio_decidir", { p_cambio: id, p_aprobar: aprobar });
  if (error) return { error: error.message };

  if (aprobar && cambio.campo === "factura_a_nit") {
    const { data: c } = await supabase.from("clientes").select("documento, factura_a_nit").eq("id", cambio.cliente_id).single();
    await reatribuirFacturas(supabase, cambio.cliente_id, c?.documento ?? null, c?.factura_a_nit ?? null);
  }
  revalidatePath("/clientes/registros");
  revalidatePath(`/clientes/${cambio.cliente_id}`);
  return { ok: aprobar ? "Cambio aplicado a la ficha." : "Cambio rechazado." };
}

/** Ata una firma `pendiente_asignar` al miembro escogido; su PDF entra a la ficha. */
export async function asignarFirma(_prev: RevisionState, formData: FormData): Promise<RevisionState> {
  await requireRole(PUEDE_REVISAR_REGISTROS);
  const firmaId = String(formData.get("firmaId") ?? "");
  const miembroId = Number(formData.get("miembroId"));
  if (!firmaId || !miembroId) return { error: "Escoge al deportista." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("consentimiento_asignar", { p_firma: firmaId, p_miembro: miembroId });
  if (error) return { error: error.message };
  revalidatePath("/clientes/registros");
  return { ok: "Firma asignada y PDF en la ficha." };
}

/**
 * Una solicitud de datos AMBIGUA (dos fichas con el mismo documento y nombre): el
 * revisor dice a cuál miembro pertenece y se aplica con la misma función de la
 * página pública. Va con el cliente de servicio porque `registro_aplicar_datos`
 * es solo de service_role; el rol ya se validó arriba.
 */
export async function aplicarSolicitud(_prev: RevisionState, formData: FormData): Promise<RevisionState> {
  const perfil = await requireRole(PUEDE_REVISAR_REGISTROS);
  const solicitudId = String(formData.get("solicitudId") ?? "");
  const miembroId = Number(formData.get("miembroId"));
  if (!solicitudId || !miembroId) return { error: "Escoge al deportista." };

  const admin = createAdminClient();
  const { data: m } = await admin.from("cliente_miembros").select("id, cliente_id").eq("id", miembroId).maybeSingle();
  if (!m) return { error: "Ese deportista no existe." };
  // La función exige `recibida`; una ambigua quedó `en_revision` sin aplicarse.
  const { error: e1 } = await admin.from("registro_solicitud").update({ estado: "recibida", revisada_por: perfil.id, revisada_el: new Date().toISOString() }).eq("id", solicitudId).eq("estado", "en_revision");
  if (e1) return { error: e1.message };
  const { data: r, error } = await admin.rpc("registro_aplicar_datos", { p_solicitud: solicitudId, p_decision: { modo: "actualizar", cliente_id: m.cliente_id, miembro_id: m.id } as unknown as Json });
  if (error || !r) return { error: error?.message ?? "No se pudo aplicar." };

  await logAudit({ action: "registro.revisar.aplicar", entity: "registro_solicitud", entityId: solicitudId, after: { miembro_id: miembroId, resultado: r as unknown as Json } });
  revalidatePath("/clientes/registros");
  revalidatePath(`/clientes/${m.cliente_id}`);
  return { ok: r.cambios_pendientes > 0 ? "Datos aplicados; la facturación quedó por aprobar." : "Datos aplicados a la ficha." };
}

/** Descarta una solicitud ambigua (con motivo). No borra: queda `rechazada` con quién y por qué. */
export async function descartarSolicitud(_prev: RevisionState, formData: FormData): Promise<RevisionState> {
  const perfil = await requireRole(PUEDE_REVISAR_REGISTROS);
  const solicitudId = String(formData.get("solicitudId") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim();
  if (!solicitudId) return { error: "Solicitud inválida." };
  if (motivo.length < 3) return { error: "Escribe el motivo." };
  const admin = createAdminClient();
  const { error } = await admin.from("registro_solicitud").update({ estado: "rechazada", revisada_por: perfil.id, revisada_el: new Date().toISOString(), nota_revision: motivo }).eq("id", solicitudId).eq("estado", "en_revision");
  if (error) return { error: error.message };
  await logAudit({ action: "registro.revisar.descartar", entity: "registro_solicitud", entityId: solicitudId, after: { motivo } });
  revalidatePath("/clientes/registros");
  return { ok: "Solicitud descartada." };
}
