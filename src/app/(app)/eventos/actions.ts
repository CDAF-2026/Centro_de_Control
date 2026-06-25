"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import type { AppRole, Deporte } from "@/lib/database.types";

const ADMIN: AppRole[] = ["superadmin", "coord_admin"];
const TIPOS = ["torneo", "clinica", "masterclass", "otro"];

export type EventoState = { error?: string; ok?: string };

export async function crearEvento(_prev: EventoState, formData: FormData): Promise<EventoState> {
  await requireRole(ADMIN);
  const nombre = String(formData.get("nombre") || "").trim();
  const tipoRaw = String(formData.get("tipo") || "otro");
  const tipo = TIPOS.includes(tipoRaw) ? tipoRaw : "otro";
  const deporteRaw = String(formData.get("deporte") || "");
  const deporte = deporteRaw === "tenis" || deporteRaw === "padel" ? (deporteRaw as Deporte) : null;
  const servicioId = Number(formData.get("servicio_id")) || null;
  const fechaInicio = String(formData.get("fecha_inicio") || "");
  const fechaFin = String(formData.get("fecha_fin") || "") || null;
  const horaInicio = String(formData.get("hora_inicio") || "") || null;
  const lugar = String(formData.get("lugar") || "").trim() || null;
  const cupo = Number(formData.get("cupo")) || null;
  const precio = Number(formData.get("precio_inscripcion") || 0);
  const notas = String(formData.get("notas") || "").trim() || null;
  if (!nombre) return { error: "El nombre es obligatorio." };
  if (!fechaInicio) return { error: "La fecha de inicio es obligatoria." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("eventos")
    .insert({
      nombre,
      tipo,
      deporte,
      servicio_id: servicioId,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      hora_inicio: horaInicio,
      lugar,
      cupo,
      precio_inscripcion: precio,
      notas,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  await logAudit({ action: "evento.crear", entity: "eventos", entityId: String(data.id), after: { nombre } });
  redirect(`/eventos/${data.id}`);
}

export async function inscribirParticipante(_prev: EventoState, formData: FormData): Promise<EventoState> {
  await requireRole(ADMIN);
  const eventoId = Number(formData.get("evento_id"));
  const clienteId = Number(formData.get("clienteId")) || null;
  const nombreExterno = String(formData.get("nombre_externo") || "").trim() || null;
  const telefonoExterno = String(formData.get("telefono_externo") || "").trim() || null;
  const monto = Number(formData.get("monto") || 0);
  if (!eventoId) return { error: "Evento inválido." };
  if (!clienteId && !nombreExterno) return { error: "Indica un cliente o un nombre externo." };

  const supabase = await createClient();
  const { data: evento } = await supabase.from("eventos").select("servicio_id, nombre").eq("id", eventoId).single();

  // Si hay monto, se registra como pago en la bolsa, etiquetado al servicio del evento.
  let pagoId: number | null = null;
  if (monto > 0) {
    if (!evento?.servicio_id) {
      return { error: "El evento no tiene un servicio asociado para registrar el cobro. Edita el evento y asígnale uno." };
    }
    const { data: pago, error: pErr } = await supabase
      .from("pagos")
      .insert({ origen: "evento", monto, servicio_id: evento.servicio_id, estado: "asignado", concepto: `Evento: ${evento.nombre}` })
      .select("id")
      .single();
    if (pErr) return { error: pErr.message };
    pagoId = pago.id;
    if (clienteId) {
      await supabase
        .from("asignaciones_pago")
        .insert({ pago_id: pagoId, cliente_id: clienteId, servicio: evento.nombre, servicio_id: evento.servicio_id });
    }
  }

  const { error } = await supabase.from("evento_participantes").insert({
    evento_id: eventoId,
    cliente_id: clienteId,
    nombre_externo: nombreExterno,
    telefono_externo: telefonoExterno,
    monto,
    pago_id: pagoId,
    estado: monto > 0 ? "pagado" : "inscrito",
  });
  if (error) return { error: error.message };
  await logAudit({ action: "evento.inscribir", entity: "evento_participantes", entityId: String(eventoId), after: { clienteId, nombreExterno, monto } });
  revalidatePath(`/eventos/${eventoId}`);
  revalidatePath("/pagos");
  return { ok: "Participante inscrito." };
}

export async function quitarParticipante(_prev: EventoState, formData: FormData): Promise<EventoState> {
  await requireRole(ADMIN);
  const id = Number(formData.get("id"));
  const eventoId = Number(formData.get("evento_id"));
  if (!id) return { error: "Inválido." };
  const supabase = await createClient();
  const { data: part } = await supabase.from("evento_participantes").select("pago_id").eq("id", id).single();
  await supabase.from("evento_participantes").delete().eq("id", id);
  if (part?.pago_id) await supabase.from("pagos").delete().eq("id", part.pago_id); // las asignaciones caen en cascada
  await logAudit({ action: "evento.quitar_participante", entity: "evento_participantes", entityId: String(id) });
  revalidatePath(`/eventos/${eventoId}`);
  revalidatePath("/pagos");
  return { ok: "Participante eliminado." };
}

export async function agregarProfesor(_prev: EventoState, formData: FormData): Promise<EventoState> {
  await requireRole(ADMIN);
  const eventoId = Number(formData.get("evento_id"));
  const profesorId = String(formData.get("profesor_id") || "");
  const rol = String(formData.get("rol") || "").trim() || null;
  const pago = Number(formData.get("pago") || 0);
  if (!eventoId) return { error: "Evento inválido." };
  if (!profesorId) return { error: "Selecciona un profesor." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("evento_profesores")
    .insert({ evento_id: eventoId, profesor_id: profesorId, rol, pago });
  if (error) return { error: error.message };
  await logAudit({ action: "evento.agregar_profesor", entity: "evento_profesores", entityId: String(eventoId), after: { profesorId, pago } });
  revalidatePath(`/eventos/${eventoId}`);
  revalidatePath("/liquidacion");
  return { ok: "Profesor agregado." };
}

export async function quitarProfesor(_prev: EventoState, formData: FormData): Promise<EventoState> {
  await requireRole(ADMIN);
  const id = Number(formData.get("id"));
  const eventoId = Number(formData.get("evento_id"));
  if (!id) return { error: "Inválido." };
  const supabase = await createClient();
  await supabase.from("evento_profesores").delete().eq("id", id);
  await logAudit({ action: "evento.quitar_profesor", entity: "evento_profesores", entityId: String(id) });
  revalidatePath(`/eventos/${eventoId}`);
  revalidatePath("/liquidacion");
  return { ok: "Profesor eliminado." };
}
