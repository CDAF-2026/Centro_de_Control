"use server";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { askAgent } from "@/lib/openai/agent";
import { logAudit } from "@/lib/audit";

export type AgenteState = { answer?: string; error?: string; question?: string };

async function reunirMetricas(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Record<string, unknown>> {
  const d = new Date();
  const d1 = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  const d2 = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);

  const [{ count: clientesActivos }, { count: clientesRetirados }, { count: profesores }, { count: academias }] =
    await Promise.all([
      supabase.from("clientes").select("*", { count: "exact", head: true }).eq("estado", "activo"),
      supabase.from("clientes").select("*", { count: "exact", head: true }).eq("estado", "retirado"),
      supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "profesor"),
      supabase.from("academias").select("*", { count: "exact", head: true }).eq("activa", true),
    ]);

  const { data: clases } = await supabase.from("clases").select("estado, deporte");
  const clasesPorEstado: Record<string, number> = {};
  const clasesPorDeporte: Record<string, number> = {};
  for (const c of clases ?? []) {
    clasesPorEstado[c.estado] = (clasesPorEstado[c.estado] ?? 0) + 1;
    if (c.deporte) clasesPorDeporte[c.deporte] = (clasesPorDeporte[c.deporte] ?? 0) + 1;
  }

  // El dinero sale de Siigo (regla 3), agregado en SQL (regla 2). Antes se leía
  // `pagos`, el modelo viejo de cobros internos: quedó en CERO filas al pasar a
  // Siigo, así que el agente venía respondiendo con cifras vacías.
  const { data: servicios } = await supabase.from("servicios").select("id, nombre");
  const nombreDe = new Map((servicios ?? []).map((s) => [s.id, s.nombre]));
  const [{ data: porServicio }, { data: recaudo }] = await Promise.all([
    supabase.rpc("siigo_ingreso_servicio", { p_desde: d1, p_hasta: d2 }),
    supabase.rpc("siigo_recaudo", { p_desde: d1, p_hasta: d2 }),
  ]);
  const ingresoPorServicio: Record<string, number> = {};
  for (const r of porServicio ?? []) {
    ingresoPorServicio[nombreDe.get(r.servicio_id) ?? "Sin categorizar"] = r.monto;
  }
  const { facturado = 0, cobrado = 0, pendiente = 0 } = recaudo?.[0] ?? {};

  return {
    mes_actual: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    moneda: "COP",
    clientes_activos: clientesActivos ?? 0,
    clientes_retirados: clientesRetirados ?? 0,
    profesores: profesores ?? 0,
    academias_activas: academias ?? 0,
    clases_por_estado: clasesPorEstado,
    clases_por_deporte: clasesPorDeporte,
    facturado_mes_por_servicio: ingresoPorServicio,
    total_facturado_mes: facturado,
    total_cobrado_mes: cobrado,
    pendiente_de_cobro_mes: pendiente,
  };
}

export async function preguntar(_prev: AgenteState, formData: FormData): Promise<AgenteState> {
  await requireRole(["superadmin"]);
  const question = String(formData.get("pregunta") || "").trim();
  if (!question) return { error: "Escribe una pregunta." };

  const supabase = await createClient();
  const metricas = await reunirMetricas(supabase);

  try {
    const answer = await askAgent(question, JSON.stringify(metricas));
    await logAudit({ action: "agente.consulta", entity: "agente_ia", after: { pregunta: question } });
    return { answer, question };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error del agente.", question };
  }
}
