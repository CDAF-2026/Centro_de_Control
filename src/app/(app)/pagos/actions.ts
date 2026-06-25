"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import type { AppRole } from "@/lib/database.types";

const ADMIN: AppRole[] = ["superadmin", "coord_admin"];

export type PagoState = { error?: string; ok?: string };

/** Importa pagos de demostración a la bolsa (mientras se integra Siigo real). */
export async function importarDemo(_prev: PagoState): Promise<PagoState> {
  await requireRole(ADMIN);
  const supabase = await createClient();
  const { data: servicios } = await supabase.from("servicios").select("id, clave");
  const idDe = (clave: string) => servicios?.find((s) => s.clave === clave)?.id;
  const now = new Date();
  const f = (d: number) => new Date(now.getFullYear(), now.getMonth(), d).toISOString().slice(0, 10);
  const demoRaw = [
    { external_id: "SG-1001", monto: 2000000, fecha: f(3), clave: "academia_padel", concepto: "Academia Pádel — trimestre" },
    { external_id: "SG-1002", monto: 480000, fecha: f(5), clave: "clase_particular", concepto: "Paquete 8 clases" },
    { external_id: "SG-1003", monto: 35000, fecha: f(6), clave: "cafeteria", concepto: "Cafetería" },
    { external_id: "SG-1004", monto: 1500000, fecha: f(8), clave: "academia_tenis", concepto: "Academia Tenis — trimestre" },
    { external_id: "SG-1005", monto: 120000, fecha: f(10), clave: "clase_particular", concepto: "Clase suelta" },
  ];
  const demo = demoRaw
    .map((d) => ({ origen: "siigo", external_id: d.external_id, monto: d.monto, fecha: d.fecha, servicio_id: idDe(d.clave), concepto: d.concepto }))
    .filter((d): d is typeof d & { servicio_id: number } => d.servicio_id != null);
  if (demo.length === 0) return { error: "No hay servicios en el catálogo todavía." };
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
  const servicioId = Number(formData.get("servicio_id"));
  const concepto = String(formData.get("concepto") || "") || null;
  if (!monto || monto < 0) return { error: "Monto inválido." };
  if (!servicioId) return { error: "Selecciona un servicio." };

  const supabase = await createClient();
  const { error } = await supabase.from("pagos").insert({ origen: "manual", monto, fecha, servicio_id: servicioId, concepto });
  if (error) return { error: error.message };
  await logAudit({ action: "pago.manual", entity: "pagos", after: { monto, servicio_id: servicioId } });
  revalidatePath("/pagos");
  return { ok: "Pago agregado a la bolsa." };
}

export async function asignarPago(_prev: PagoState, formData: FormData): Promise<PagoState> {
  await requireRole(ADMIN);
  const pagoId = Number(formData.get("pagoId"));
  const clienteId = Number(formData.get("clienteId"));
  const servicioId = Number(formData.get("servicio_id"));
  const periodos = String(formData.get("periodos") || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!clienteId) return { error: "Selecciona un cliente." };
  if (!servicioId) return { error: "Indica el servicio." };

  const supabase = await createClient();
  // Guardamos también el nombre del servicio (texto) como respaldo de la conciliación.
  const { data: sv } = await supabase.from("servicios").select("nombre").eq("id", servicioId).single();
  const { error } = await supabase
    .from("asignaciones_pago")
    .insert({ pago_id: pagoId, cliente_id: clienteId, servicio_id: servicioId, servicio: sv?.nombre ?? "", periodos });
  if (error) {
    return { error: /duplicate|unique/i.test(error.message) ? "El pago ya está asignado." : error.message };
  }
  await supabase.from("pagos").update({ estado: "asignado" }).eq("id", pagoId);
  await logAudit({
    action: "pago.asignar",
    entity: "asignaciones_pago",
    entityId: String(pagoId),
    after: { cliente_id: clienteId, servicio_id: servicioId, periodos },
  });
  revalidatePath("/pagos");
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: "Pago asignado." };
}
