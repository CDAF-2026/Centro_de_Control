import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Re-engancha las facturas de Siigo del cliente según su identidad de facturación.
 *
 * Vive aquí (y no dentro de clientes/actions.ts) desde la Fase 3 del registro por QR:
 * la bandeja de revisión la necesita al APROBAR un NIT. El camino público nunca la
 * llama — mover facturas exige una persona con sesión.
 * Reglas de seguridad (mueve plata):
 *  - Solo se atan facturas SIN dueño (cliente_id null): nunca se le quitan a otro cliente.
 *  - Nunca se tocan las conciliadas a mano.
 *  - Se sueltan las que habían quedado atadas por un NIT de facturación que ya no aplica.
 */
export async function reatribuirFacturas(
  supabase: SupabaseClient<Database>,
  clienteId: number,
  documento: string | null,
  facturaANit: string | null,
) {
  const conservar = new Set([documento, facturaANit].filter(Boolean).map((x) => String(x).trim()));

  // 1) Soltar las atadas por un NIT que ya no corresponde a este cliente.
  const { data: atadas } = await supabase
    .from("siigo_facturas")
    .select("id, cliente_identificacion, estado_conciliacion")
    .eq("cliente_id", clienteId);
  const soltar = (atadas ?? [])
    .filter(
      (f) => f.estado_conciliacion !== "conciliada" && !conservar.has((f.cliente_identificacion ?? "").trim()),
    )
    .map((f) => f.id);
  if (soltar.length) {
    await supabase
      .from("siigo_facturas")
      .update({ cliente_id: null, estado_conciliacion: "pendiente" })
      .in("id", soltar);
  }

  // 2) Atar las del NIT de facturación que hoy no tienen dueño.
  if (facturaANit) {
    const { data: libres } = await supabase
      .from("siigo_facturas")
      .select("id")
      .eq("cliente_identificacion", facturaANit)
      .is("cliente_id", null)
      .neq("estado_conciliacion", "conciliada");
    const atar = (libres ?? []).map((f) => f.id);
    if (atar.length) {
      await supabase
        .from("siigo_facturas")
        .update({ cliente_id: clienteId, estado_conciliacion: "auto" })
        .in("id", atar);
    }
  }
}

