"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import type { AppRole, CentroCostos } from "@/lib/database.types";

const ADMIN: AppRole[] = ["superadmin", "coord_admin"];
const CENTROS: CentroCostos[] = ["clase_particular", "cafeteria", "academia_tenis", "academia_padel", "otro"];

export type PagoState = { error?: string; ok?: string };

/** Importa pagos de demostración a la bolsa (mientras se integra Siigo real). */
export async function importarDemo(_prev: PagoState): Promise<PagoState> {
  await requireRole(ADMIN);
  const supabase = await createClient();
  const now = new Date();
  const f = (d: number) => new Date(now.getFullYear(), now.getMonth(), d).toISOString().slice(0, 10);
  const demo = [
    { origen: "siigo", external_id: "SG-1001", monto: 2000000, fecha: f(3), centro_costos: "academia_padel" as CentroCostos, concepto: "Academia Pádel — trimestre" },
    { origen: "siigo", external_id: "SG-1002", monto: 480000, fecha: f(5), centro_costos: "clase_particular" as CentroCostos, concepto: "Paquete 8 clases" },
    { origen: "siigo", external_id: "SG-1003", monto: 35000, fecha: f(6), centro_costos: "cafeteria" as CentroCostos, concepto: "Cafetería" },
    { origen: "siigo", external_id: "SG-1004", monto: 1500000, fecha: f(8), centro_costos: "academia_tenis" as CentroCostos, concepto: "Academia Tenis — trimestre" },
    { origen: "siigo", external_id: "SG-1005", monto: 120000, fecha: f(10), centro_costos: "clase_particular" as CentroCostos, concepto: "Clase suelta" },
  ];
  const { error } = await supabase.from("pagos").insert(demo);
  if (error) return { error: error.message };
  await logAudit({ action: "pago.import_demo", entity: "pagos", after: { n: demo.length } });
  revalidatePath("/pagos");
  return { ok: `${demo.length} pagos demo importados.` };
}

export async function addPago(_prev: PagoState, formData: FormData): Promise<PagoState> {
  await requireRole(ADMIN);
  const monto = Number(formData.get("monto"));
  const fecha = String(formData.get("fecha") || "") || new Date().toISOString().slice(0, 10);
  const centroRaw = String(formData.get("centro_costos") || "otro");
  const centro = (CENTROS as string[]).includes(centroRaw) ? (centroRaw as CentroCostos) : "otro";
  const concepto = String(formData.get("concepto") || "") || null;
  if (!monto || monto < 0) return { error: "Monto inválido." };

  const supabase = await createClient();
  const { error } = await supabase.from("pagos").insert({ origen: "manual", monto, fecha, centro_costos: centro, concepto });
  if (error) return { error: error.message };
  await logAudit({ action: "pago.manual", entity: "pagos", after: { monto, centro } });
  revalidatePath("/pagos");
  return { ok: "Pago agregado a la bolsa." };
}

export async function asignarPago(_prev: PagoState, formData: FormData): Promise<PagoState> {
  await requireRole(ADMIN);
  const pagoId = Number(formData.get("pagoId"));
  const clienteId = Number(formData.get("clienteId"));
  const servicio = String(formData.get("servicio") || "").trim();
  const periodos = String(formData.get("periodos") || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!clienteId) return { error: "Selecciona un cliente." };
  if (!servicio) return { error: "Indica el servicio." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("asignaciones_pago")
    .insert({ pago_id: pagoId, cliente_id: clienteId, servicio, periodos });
  if (error) {
    return { error: /duplicate|unique/i.test(error.message) ? "El pago ya está asignado." : error.message };
  }
  await supabase.from("pagos").update({ estado: "asignado" }).eq("id", pagoId);
  await logAudit({
    action: "pago.asignar",
    entity: "asignaciones_pago",
    entityId: String(pagoId),
    after: { cliente_id: clienteId, servicio, periodos },
  });
  revalidatePath("/pagos");
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: "Pago asignado." };
}
