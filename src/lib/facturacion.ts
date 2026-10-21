import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Los NIT de facturación de una ficha: el primero (clientes.factura_a_nit) y los adicionales
 * (cliente_facturacion_extra, 21-oct-2026: a un niño le puede pagar el papá o la mamá).
 */
export async function nitsDeFacturacion(supabase: SupabaseClient<Database>, clienteId: number) {
  const [{ data: c }, { data: extra }] = await Promise.all([
    supabase.from("clientes").select("documento, factura_a_nit").eq("id", clienteId).maybeSingle(),
    supabase.from("cliente_facturacion_extra").select("nit").eq("cliente_id", clienteId),
  ]);
  const nits = [c?.factura_a_nit, ...(extra ?? []).map((e) => e.nit)].filter((x): x is string => !!x).map((x) => x.trim());
  return { documento: c?.documento?.trim() || null, nits: Array.from(new Set(nits)) };
}

/**
 * Re-engancha las facturas de Siigo del cliente según su identidad de facturación: su documento
 * y TODOS sus NIT de facturación (se leen aquí, así ningún llamador se queda con una lista vieja).
 *
 * Vive aquí (y no dentro de clientes/actions.ts) desde la Fase 3 del registro por QR:
 * la bandeja de revisión la necesita al APROBAR un NIT. El camino público nunca la
 * llama — mover facturas exige una persona con sesión.
 * Reglas de seguridad (mueve plata):
 *  - Solo se atan facturas SIN dueño (cliente_id null): nunca se le quitan a otro cliente.
 *  - Nunca se tocan las conciliadas a mano.
 *  - Se sueltan las que habían quedado atadas por un NIT de facturación que ya no aplica.
 */
export async function reatribuirFacturas(supabase: SupabaseClient<Database>, clienteId: number) {
  const { documento, nits } = await nitsDeFacturacion(supabase, clienteId);
  const conservar = new Set([documento, ...nits].filter(Boolean));

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

  // 2) Atar las de sus NIT de facturación que hoy no tienen dueño.
  if (nits.length) {
    const { data: libres } = await supabase
      .from("siigo_facturas")
      .select("id")
      .in("cliente_identificacion", nits)
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
