"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { createAcademiaSchema } from "@/lib/validations/academia";
import type { AppRole } from "@/lib/database.types";

const GESTION: AppRole[] = ["superadmin", "coord_admin", "coord_deportivo"];
const INSCRIBE: AppRole[] = ["superadmin", "coord_admin", "coord_deportivo", "recepcion"];

export type AcademiaFormState = {
  error?: string;
  ok?: string;
  fieldErrors?: Record<string, string>;
};

export async function createAcademia(
  _prev: AcademiaFormState,
  formData: FormData,
): Promise<AcademiaFormState> {
  await requireRole(GESTION);
  const parsed = createAcademiaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] = i.message;
    return { error: "Revisa los campos.", fieldErrors };
  }
  const d = parsed.data;
  const dias = formData
    .getAll("dias")
    .map((x) => Number(x))
    .filter((n) => n >= 0 && n <= 6);

  const supabase = await createClient();
  const { count } = await supabase
    .from("academias")
    .select("*", { count: "exact", head: true });
  const seq = String((count ?? 0) + 1).padStart(4, "0");
  const codigo = `ACA-2026-${d.deporte === "tenis" ? "TEN" : "PAD"}-${seq}`;

  const { data: ac, error } = await supabase
    .from("academias")
    .insert({
      codigo,
      nombre: d.nombre,
      deporte: d.deporte,
      nivel: d.nivel || null,
      profesor_id: d.profesorId || null,
      cancha: d.cancha || null,
      precio: d.precio,
      matricula: d.matricula,
      periodo_inicio: d.periodoInicio || null,
      periodo_fin: d.periodoFin || null,
      dias_semana: dias,
      hora_inicio: d.horaInicio || null,
      hora_fin: d.horaFin || null,
    })
    .select("id")
    .single();
  if (error || !ac) return { error: error?.message ?? "No se pudo crear la academia." };

  await logAudit({
    action: "academia.create",
    entity: "academias",
    entityId: String(ac.id),
    after: { codigo, nombre: d.nombre },
  });
  revalidatePath("/academias");
  redirect(`/academias/${ac.id}`);
}

export async function inscribirCliente(
  _prev: AcademiaFormState,
  formData: FormData,
): Promise<AcademiaFormState> {
  await requireRole(INSCRIBE);
  const academiaId = Number(formData.get("academiaId"));
  const plan = Number(formData.get("plan"));
  const descuento = Number(formData.get("descuento") || 0);
  const dias = formData
    .getAll("dias")
    .map((d) => Number(d))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  if (![1, 2, 3].includes(plan)) return { error: "Plan inválido." };
  if (descuento < 0 || descuento > 100) return { error: "Descuento inválido." };

  const supabase = await createClient();
  // Se busca a la PERSONA (miembro): la familia (cliente_id) sale del propio miembro.
  const miembroSel = Number(formData.get("miembroId")) || null;
  let miembroId: number | null = null;
  let clienteId = Number(formData.get("clienteId")) || 0;
  if (miembroSel) {
    const { data } = await supabase.from("cliente_miembros").select("id, cliente_id").eq("id", miembroSel).maybeSingle();
    if (data) { miembroId = data.id; clienteId = data.cliente_id; }
  }
  if (!clienteId) return { error: "Selecciona a la persona." };
  if (!miembroId) {
    const { data: tit } = await supabase.from("cliente_miembros").select("id").eq("cliente_id", clienteId).eq("es_titular", true).maybeSingle();
    miembroId = tit?.id ?? null;
  }

  const { error } = await supabase.from("inscripciones").insert({
    academia_id: academiaId,
    cliente_id: clienteId,
    miembro_id: miembroId,
    plan_frecuencia: plan,
    descuento_pct: descuento,
    dias,
  });
  if (error) {
    return {
      error: /duplicate|unique/i.test(error.message)
        ? "Ese hermano ya está inscrito en esta academia."
        : error.message,
    };
  }
  await logAudit({
    action: "academia.inscribir",
    entity: "inscripciones",
    entityId: String(academiaId),
    after: { cliente_id: clienteId, plan, descuento_pct: descuento },
  });
  revalidatePath(`/academias/${academiaId}`);
  return { ok: "Cliente inscrito." };
}

export async function addListaEspera(
  _prev: AcademiaFormState,
  formData: FormData,
): Promise<AcademiaFormState> {
  await requireRole(INSCRIBE);
  const academiaId = Number(formData.get("academiaId")) || null;
  const nombre = String(formData.get("nombre") || "").trim();
  if (!nombre) return { error: "Nombre requerido." };

  const supabase = await createClient();
  const { error } = await supabase.from("lista_espera").insert({
    academia_id: academiaId,
    nombre,
    contacto: String(formData.get("contacto") || "") || null,
    nivel: String(formData.get("nivel") || "") || null,
    edad: Number(formData.get("edad")) || null,
    disponibilidad: String(formData.get("disponibilidad") || "") || null,
  });
  if (error) return { error: error.message };
  await logAudit({ action: "academia.lista_espera", entity: "lista_espera", entityId: String(academiaId) });
  revalidatePath(`/academias/${academiaId}`);
  return { ok: "Agregado a la lista de espera." };
}

/** Genera las clases del periodo según los días/horas de la academia. */
export async function generarProgramacion(
  _prev: AcademiaFormState,
  formData: FormData,
): Promise<AcademiaFormState> {
  await requireRole(GESTION);
  const academiaId = Number(formData.get("academiaId"));
  const supabase = await createClient();
  const { data: a } = await supabase.from("academias").select("*").eq("id", academiaId).single();
  if (!a) return { error: "Academia no encontrada." };
  if (!a.periodo_inicio || !a.periodo_fin || !a.dias_semana?.length) {
    return { error: "Define periodo (inicio/fin) y días de la semana antes de programar." };
  }

  // Regenera: borra las clases aún programadas y crea el calendario del periodo.
  await supabase.from("clases").delete().eq("academia_id", academiaId).eq("estado", "programada");

  const rows: { tipo: "academia"; academia_id: number; profesor_id: string | null; deporte: typeof a.deporte; nivel: string | null; cancha: string | null; fecha: string; hora_inicio: string | null; hora_fin: string | null; estado: "programada" }[] = [];
  const end = new Date(`${a.periodo_fin}T00:00:00`);
  for (let d = new Date(`${a.periodo_inicio}T00:00:00`); d <= end; d.setDate(d.getDate() + 1)) {
    if (a.dias_semana.includes(d.getDay())) {
      rows.push({
        tipo: "academia",
        academia_id: academiaId,
        profesor_id: a.profesor_id,
        deporte: a.deporte,
        nivel: a.nivel,
        cancha: a.cancha,
        fecha: d.toISOString().slice(0, 10),
        hora_inicio: a.hora_inicio,
        hora_fin: a.hora_fin,
        estado: "programada",
      });
    }
  }
  if (rows.length) {
    const { error } = await supabase.from("clases").insert(rows);
    if (error) return { error: error.message };
  }
  await logAudit({
    action: "academia.programar",
    entity: "academias",
    entityId: String(academiaId),
    after: { clases_generadas: rows.length },
  });
  revalidatePath(`/academias/${academiaId}`);
  return { ok: `${rows.length} clases programadas.` };
}

/** Edita los datos de una academia existente. */
export async function updateAcademia(
  _prev: AcademiaFormState,
  formData: FormData,
): Promise<AcademiaFormState> {
  await requireRole(GESTION);
  const id = Number(formData.get("id"));
  if (!id) return { error: "Academia inválida." };
  const parsed = createAcademiaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] = i.message;
    return { error: "Revisa los campos.", fieldErrors };
  }
  const d = parsed.data;
  const dias = formData.getAll("dias").map((x) => Number(x)).filter((n) => n >= 0 && n <= 6);

  const supabase = await createClient();
  const { error } = await supabase
    .from("academias")
    .update({
      nombre: d.nombre,
      deporte: d.deporte,
      nivel: d.nivel || null,
      profesor_id: d.profesorId || null,
      cancha: d.cancha || null,
      precio: d.precio,
      matricula: d.matricula,
      periodo_inicio: d.periodoInicio || null,
      periodo_fin: d.periodoFin || null,
      dias_semana: dias,
      hora_inicio: d.horaInicio || null,
      hora_fin: d.horaFin || null,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  await logAudit({ action: "academia.update", entity: "academias", entityId: String(id), after: { nombre: d.nombre } });
  revalidatePath("/academias");
  revalidatePath(`/academias/${id}`);
  redirect(`/academias/${id}`);
}

/** Reprograma una clase puntual (cambio espontáneo): cambia fecha y/u hora. */
export async function reprogramarClase(
  _prev: AcademiaFormState,
  formData: FormData,
): Promise<AcademiaFormState> {
  await requireRole(GESTION);
  const claseId = Number(formData.get("claseId"));
  const academiaId = Number(formData.get("academiaId"));
  const fecha = String(formData.get("fecha") || "");
  const horaInicio = String(formData.get("horaInicio") || "") || null;
  const horaFin = String(formData.get("horaFin") || "") || null;
  if (!claseId || !fecha) return { error: "Fecha requerida." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("clases")
    .update({ fecha, hora_inicio: horaInicio, hora_fin: horaFin })
    .eq("id", claseId);
  if (error) return { error: error.message };

  await logAudit({ action: "clase.reprogramar", entity: "clases", entityId: String(claseId), after: { fecha, horaInicio, horaFin } });
  revalidatePath(`/academias/${academiaId}`);
  revalidatePath("/clases");
  return { ok: "Clase reprogramada." };
}

/** Cancela una clase puntual (no la borra: queda como cancelada). */
export async function cancelarClase(
  _prev: AcademiaFormState,
  formData: FormData,
): Promise<AcademiaFormState> {
  await requireRole(GESTION);
  const claseId = Number(formData.get("claseId"));
  const academiaId = Number(formData.get("academiaId"));
  if (!claseId) return { error: "Clase inválida." };

  const supabase = await createClient();
  const { error } = await supabase.from("clases").update({ estado: "cancelada" }).eq("id", claseId);
  if (error) return { error: error.message };

  await logAudit({ action: "clase.cancelar", entity: "clases", entityId: String(claseId), after: { estado: "cancelada" } });
  revalidatePath(`/academias/${academiaId}`);
  revalidatePath("/clases");
  return { ok: "Clase cancelada." };
}

/** Elimina una academia. Conserva el historial: las clases NO programadas (realizadas/
 *  canceladas) se desligan (quedan para liquidación). Las futuras e inscripciones se borran. */
export async function eliminarAcademia(academiaId: number): Promise<AcademiaFormState> {
  await requireRole(GESTION);
  if (!academiaId) return { error: "Academia inválida." };
  const supabase = await createClient();

  // Preservar historial: desliga clases ya realizadas/canceladas (no se borran en cascada).
  await supabase.from("clases").update({ academia_id: null }).eq("academia_id", academiaId).neq("estado", "programada");

  // Borra la academia (cascada: clases programadas + inscripciones; lista de espera se desliga).
  const { error } = await supabase.from("academias").delete().eq("id", academiaId);
  if (error) return { error: error.message };

  await logAudit({ action: "academia.delete", entity: "academias", entityId: String(academiaId) });
  revalidatePath("/academias");
  redirect("/academias");
}
