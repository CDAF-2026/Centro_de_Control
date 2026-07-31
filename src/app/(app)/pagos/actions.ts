"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import type { AppRole } from "@/lib/database.types";

const ADMIN: AppRole[] = rolesForModule("bolsa_pagos", "edit");

export type PagoState = { error?: string; ok?: string };

/** Concilia una factura de Siigo: le asigna el cliente (y el evento si aplica). */
export async function conciliarFactura(_prev: PagoState, formData: FormData): Promise<PagoState> {
  await requireRole(ADMIN);
  const facturaId = Number(formData.get("facturaId"));
  const clienteId = Number(formData.get("clienteId")) || null;
  if (!facturaId) return { error: "Factura inválida." };
  if (!clienteId) return { error: "Selecciona un cliente." };

  const supabase = await createClient();

  const { data: fac } = await supabase
    .from("siigo_facturas")
    .select("cliente_identificacion")
    .eq("id", facturaId)
    .single();
  const nit = fac?.cliente_identificacion?.trim() || null;
  const esGenerico = !nit || /^(\d)\1+$/.test(nit);

  // Solo cliente + estado. `evento_id` NO se toca: lo maneja la ficha del evento, y
  // escribirlo aquí borraba el evento de una factura que ya estaba atada.
  const { error } = await supabase
    .from("siigo_facturas")
    .update({ cliente_id: clienteId, estado_conciliacion: "conciliada" })
    .eq("id", facturaId);
  if (error) return { error: error.message };

  // Conciliación por NIT: ata las DEMÁS facturas del mismo NIT al cliente y guarda su documento.
  let bulk = 0;
  if (clienteId && nit && !esGenerico) {
    const { count } = await supabase
      .from("siigo_facturas")
      .update({ cliente_id: clienteId, estado_conciliacion: "conciliada" }, { count: "exact" })
      .eq("cliente_identificacion", nit)
      .neq("id", facturaId)
      .neq("estado_conciliacion", "conciliada");
    bulk = count ?? 0;
    const { data: cli } = await supabase.from("clientes").select("documento").eq("id", clienteId).single();
    if (!cli?.documento) await supabase.from("clientes").update({ documento: nit }).eq("id", clienteId);
  }

  await logAudit({ action: "siigo.conciliar", entity: "siigo_facturas", entityId: String(facturaId), after: { clienteId, nit, bulk } });
  revalidatePath("/pagos");
  if (clienteId) revalidatePath(`/clientes/${clienteId}`);
  return { ok: bulk > 0 ? `Conciliada · +${bulk} factura(s) del mismo NIT.` : "Factura conciliada." };
}

/**
 * Devuelve una factura a la cola de conciliación. Sirve para deshacer un "Es mostrador"
 * marcado por error, o para rescatar una venta que Siigo facturó al NIT genérico pero que
 * sí tiene dueño. El sync respeta este estado y no la vuelve a cerrar como mostrador.
 */
export async function devolverACola(_prev: PagoState, formData: FormData): Promise<PagoState> {
  await requireRole(ADMIN);
  const facturaId = Number(formData.get("facturaId"));
  if (!facturaId) return { error: "Factura inválida." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("siigo_facturas")
    .update({ estado_conciliacion: "pendiente", cliente_id: null, evento_id: null })
    .eq("id", facturaId);
  if (error) return { error: error.message };
  await logAudit({ action: "siigo.devolver_cola", entity: "siigo_facturas", entityId: String(facturaId) });
  revalidatePath("/pagos");
  return { ok: "Devuelta a la cola de conciliación." };
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
