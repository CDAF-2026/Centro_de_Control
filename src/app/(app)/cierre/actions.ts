"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

export type CierreState = { error?: string; ok?: string };

const ESTADOS = ["realizada", "cancelada", "no_show"] as const;

export async function cerrarClase(
  _prev: CierreState,
  formData: FormData,
): Promise<CierreState> {
  const profile = await requireProfile();
  const claseId = Number(formData.get("claseId"));
  const estadoRaw = String(formData.get("estado"));
  if (!(ESTADOS as readonly string[]).includes(estadoRaw)) return { error: "Estado inválido." };
  const estado = estadoRaw as (typeof ESTADOS)[number];

  const supabase = await createClient();
  const { data: clase } = await supabase
    .from("clases")
    .select("id, profesor_id, fecha, hora_inicio, paquete_cliente_id")
    .eq("id", claseId)
    .single();
  if (!clase) return { error: "Clase no encontrada." };

  const esAdmin = ["superadmin", "coord_admin", "coord_deportivo"].includes(profile.role);
  const esDueno = clase.profesor_id === profile.id;
  if (!esAdmin && !esDueno) return { error: "No autorizado para cerrar esta clase." };

  // Ventana de 24h: pasado el plazo, solo el superadministrador puede registrar.
  const dt = new Date(`${clase.fecha}T${clase.hora_inicio ?? "23:59"}:00`);
  const venció = Date.now() > dt.getTime() + 24 * 3600 * 1000;
  if (venció && profile.role !== "superadmin") {
    return {
      error: "Pasaron más de 24 h. Solo el superadministrador puede registrarla (solicítaselo).",
    };
  }

  const { error: upErr } = await supabase
    .from("clases")
    .update({ estado, registrada_por: profile.id })
    .eq("id", claseId);
  if (upErr) return { error: upErr.message };

  // Asistencia por deportista.
  const deportistas = formData.getAll("deportista").map(Number).filter(Boolean);
  for (const cid of deportistas) {
    await supabase.from("asistencias").upsert(
      {
        clase_id: claseId,
        cliente_id: cid,
        presente: formData.get(`presente_${cid}`) === "on",
        registrado_por: profile.id,
      },
      { onConflict: "clase_id,cliente_id" },
    );
  }

  // Consumo de paquete (si la clase está ligada a uno y se dictó).
  if (estado === "realizada" && clase.paquete_cliente_id) {
    const { data: pq } = await supabase
      .from("paquetes_cliente")
      .select("num_clases, clases_consumidas")
      .eq("id", clase.paquete_cliente_id)
      .single();
    if (pq) {
      const consumidas = pq.clases_consumidas + 1;
      await supabase
        .from("paquetes_cliente")
        .update({
          clases_consumidas: consumidas,
          estado: consumidas >= pq.num_clases ? "agotado" : "activo",
        })
        .eq("id", clase.paquete_cliente_id);
    }
  }

  await logAudit({
    action: "clase.cierre",
    entity: "clases",
    entityId: String(claseId),
    after: { estado },
  });
  revalidatePath("/cierre");
  revalidatePath(`/cierre/${claseId}`);
  revalidatePath("/liquidacion");
  return { ok: "Clase registrada." };
}
