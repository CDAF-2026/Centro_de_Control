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
      categoria: d.categoria,
      servicio_id: Number(d.servicioId) || null,
      precio: d.precio,
      matricula: d.matricula,
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

/** "16:30" + 90 min → "18:00". Devuelve null si la hora no parsea. */
function sumarMinutos(hhmm: string, minutos: number): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim());
  if (!m) return null;
  const total = Number(m[1]) * 60 + Number(m[2]) + minutos;
  if (total > 24 * 60) return null;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Lee los horarios del formulario. Vienen como arreglos paralelos (una posición
 * por fila): día, hora de inicio, duración en minutos, profesor y cancha.
 */
function horariosDelForm(formData: FormData) {
  const dias = formData.getAll("h_dia").map(String);
  const horas = formData.getAll("h_hora").map(String);
  const durs = formData.getAll("h_dur").map(String);
  const profes = formData.getAll("h_profesor").map(String);
  const canchas = formData.getAll("h_cancha").map(String);

  const out: { dia_semana: number; hora_inicio: string; hora_fin: string; profesor_id: string | null; cancha: string | null }[] = [];
  for (let i = 0; i < dias.length; i++) {
    const dia = Number(dias[i]);
    const hora = (horas[i] ?? "").trim();
    const dur = Number(durs[i]) || 60;
    if (!Number.isInteger(dia) || dia < 0 || dia > 6 || !hora) continue; // fila vacía
    const fin = sumarMinutos(hora, dur);
    if (!fin) continue;
    out.push({
      dia_semana: dia,
      hora_inicio: hora,
      hora_fin: fin,
      profesor_id: (profes[i] ?? "").trim() || null,
      cancha: (canchas[i] ?? "").trim() || null,
    });
  }
  return out;
}

/** Traduce el error de Postgres a algo que se entienda en pantalla. */
function errorInscripcion(msg: string): string {
  if (/una sola academia por deporte/i.test(msg)) return msg.replace(/^.*?:\s*/, "");
  if (/duplicate|unique/i.test(msg)) return "Esa persona ya está inscrita en esta academia.";
  return msg;
}

/**
 * Inscribe a un niño en una academia con sus horarios.
 *
 * El horario cuelga del INSCRITO, no de la academia: el mismo niño puede venir
 * martes 16:30 con un profesor y sábado 12:00 con otro. Cada fila del formulario
 * es una de esas venidas.
 */
export async function inscribirCliente(
  _prev: AcademiaFormState,
  formData: FormData,
): Promise<AcademiaFormState> {
  await requireRole(INSCRIBE);
  const academiaId = Number(formData.get("academiaId"));
  const nivel = String(formData.get("nivel") || "").trim() || null;
  const descuento = Number(formData.get("descuento") || 0);
  if (descuento < 0 || descuento > 100) return { error: "Descuento inválido." };

  const horarios = horariosDelForm(formData);
  if (horarios.length === 0) return { error: "Agrega al menos un día con su hora." };

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

  const { data: ins, error } = await supabase
    .from("inscripciones")
    .insert({ academia_id: academiaId, cliente_id: clienteId, miembro_id: miembroId, nivel, descuento_pct: descuento })
    .select("id")
    .single();
  if (error || !ins) return { error: errorInscripcion(error?.message ?? "No se pudo inscribir.") };

  const { error: errH } = await supabase
    .from("inscripcion_horarios")
    .insert(horarios.map((h) => ({ ...h, inscripcion_id: ins.id })));
  if (errH) {
    // Sin horarios la inscripción no sirve para nada: mejor deshacerla que dejarla a medias.
    await supabase.from("inscripciones").delete().eq("id", ins.id);
    return { error: `No se pudieron guardar los horarios: ${errH.message}` };
  }

  await logAudit({
    action: "academia.inscribir",
    entity: "inscripciones",
    entityId: String(ins.id),
    after: { academia_id: academiaId, miembro_id: miembroId, nivel, horarios: horarios.length },
  });
  revalidatePath(`/academias/${academiaId}`);
  return { ok: `Inscrito con ${horarios.length} ${horarios.length === 1 ? "horario" : "horarios"}.` };
}

/** Agrega un día más al horario de un inscrito ya existente. */
export async function agregarHorario(
  _prev: AcademiaFormState,
  formData: FormData,
): Promise<AcademiaFormState> {
  await requireRole(INSCRIBE);
  const inscripcionId = Number(formData.get("inscripcionId"));
  const academiaId = Number(formData.get("academiaId"));
  const horarios = horariosDelForm(formData);
  if (!inscripcionId || horarios.length === 0) return { error: "Falta el día y la hora." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("inscripcion_horarios")
    .insert(horarios.map((h) => ({ ...h, inscripcion_id: inscripcionId })));
  if (error) {
    return {
      error: /duplicate|unique/i.test(error.message)
        ? "Ya tiene un horario ese día a esa hora."
        : error.message,
    };
  }

  await logAudit({ action: "academia.horario_add", entity: "inscripcion_horarios", entityId: String(inscripcionId), after: horarios[0] });
  revalidatePath(`/academias/${academiaId}`);
  return { ok: "Horario agregado." };
}

/** Quita un día del horario de un inscrito. */
export async function quitarHorario(horarioId: number, academiaId: number): Promise<AcademiaFormState> {
  await requireRole(INSCRIBE);
  const supabase = await createClient();
  const { error } = await supabase.from("inscripcion_horarios").delete().eq("id", horarioId);
  if (error) return { error: error.message };
  await logAudit({ action: "academia.horario_del", entity: "inscripcion_horarios", entityId: String(horarioId) });
  revalidatePath(`/academias/${academiaId}`);
  return { ok: "Horario quitado." };
}

export type AsistenteClase = {
  miembro_id: number;
  nombre: string;
  estado: string;
  /** false = vino a una clase que no era su día (reposición). */
  esperado: boolean;
};

/**
 * Quiénes quedaron registrados en una clase. Se pide al desplegar la clase y no
 * junto con el listado: traer la asistencia de todo un semestre serían ~1.600
 * filas y PostgREST corta en 1.000 sin avisar.
 */
export async function asistenciaDeClase(claseId: number): Promise<AsistenteClase[]> {
  await requireRole(GESTION);
  const supabase = await createClient();
  const { data } = await supabase.rpc("academia_asistencia_clase", { p_clase: claseId });
  return (data ?? []) as AsistenteClase[];
}

/** Saca a un niño de la academia (se van sus horarios en cascada). */
export async function quitarInscripcion(inscripcionId: number, academiaId: number): Promise<AcademiaFormState> {
  await requireRole(INSCRIBE);
  const supabase = await createClient();
  const { error } = await supabase.from("inscripciones").delete().eq("id", inscripcionId);
  if (error) return { error: error.message };
  await logAudit({ action: "academia.desinscribir", entity: "inscripciones", entityId: String(inscripcionId) });
  revalidatePath(`/academias/${academiaId}`);
  return { ok: "Retirado de la academia." };
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

  const supabase = await createClient();
  const { error } = await supabase
    .from("academias")
    .update({
      nombre: d.nombre,
      deporte: d.deporte,
      categoria: d.categoria,
      servicio_id: Number(d.servicioId) || null,
      precio: d.precio,
      matricula: d.matricula,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  await logAudit({ action: "academia.update", entity: "academias", entityId: String(id), after: { nombre: d.nombre } });
  revalidatePath("/academias");
  revalidatePath(`/academias/${id}`);
  redirect(`/academias/${id}`);
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
