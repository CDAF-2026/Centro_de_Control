"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import type { AppRole } from "@/lib/database.types";

const ADMIN: AppRole[] = ["superadmin", "coord_admin"];

export type PagoState = { error?: string; ok?: string };

/** Concilia una factura de Siigo: le asigna el cliente (y el evento si aplica). */
export async function conciliarFactura(_prev: PagoState, formData: FormData): Promise<PagoState> {
  await requireRole(ADMIN);
  const facturaId = Number(formData.get("facturaId"));
  const clienteId = Number(formData.get("clienteId")) || null;
  const eventoId = Number(formData.get("eventoId")) || null;
  if (!facturaId) return { error: "Factura inválida." };
  if (!clienteId && !eventoId) return { error: "Selecciona un cliente o un evento." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("siigo_facturas")
    .update({ cliente_id: clienteId, evento_id: eventoId, estado_conciliacion: "conciliada" })
    .eq("id", facturaId);
  if (error) return { error: error.message };
  await logAudit({ action: "siigo.conciliar", entity: "siigo_facturas", entityId: String(facturaId), after: { clienteId, eventoId } });
  revalidatePath("/pagos");
  if (clienteId) revalidatePath(`/clientes/${clienteId}`);
  if (eventoId) revalidatePath(`/eventos/${eventoId}`);
  return { ok: "Factura conciliada." };
}

/** Marca una factura como ingreso de mostrador (anónimo): sale de la cola, cuenta como ingreso. */
export async function marcarMostrador(_prev: PagoState, formData: FormData): Promise<PagoState> {
  await requireRole(ADMIN);
  const facturaId = Number(formData.get("facturaId"));
  if (!facturaId) return { error: "Factura inválida." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("siigo_facturas")
    .update({ estado_conciliacion: "mostrador", cliente_id: null, evento_id: null })
    .eq("id", facturaId);
  if (error) return { error: error.message };
  await logAudit({ action: "siigo.mostrador", entity: "siigo_facturas", entityId: String(facturaId) });
  revalidatePath("/pagos");
  return { ok: "Marcada como mostrador." };
}
