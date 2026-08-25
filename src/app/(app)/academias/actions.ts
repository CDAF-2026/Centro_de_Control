"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { createAcademiaSchema } from "@/lib/validations/academia";
import { NIVELES_GRUPO } from "@/lib/validations/academia";
import type { AppRole, AcademiaNivel } from "@/lib/database.types";

// Una sola puerta, derivada de la matriz. Antes eran dos listas escritas a mano
// (GESTION e INSCRIBE) y la de inscribir incluía a recepción: por eso recepción
// seguía matriculando niños aunque el módulo le quedara en solo lectura.
// Inscribir a alguien ES editar la academia, así que va con el mismo permiso.
const EDITA: AppRole[] = rolesForModule("academias", "edit");

export type AcademiaFormState = {
  error?: string;
  ok?: string;
  fieldErrors?: Record<string, string>;
};

export async function createAcademia(
  _prev: AcademiaFormState,
  formData: FormData,
): Promise<AcademiaFormState> {
  await requireRole(EDITA);
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

/** Traduce el error de Postgres a algo que se entienda en pantalla. */
function errorInscripcion(msg: string): string {
  if (/una sola academia por deporte/i.test(msg)) return msg.replace(/^.*?:\s*/, "");
  if (/duplicate|unique/i.test(msg)) return "Esa persona ya está inscrita en esta academia.";
  return msg;
}

/** Saca a un niño de la academia (se van sus horarios en cascada). */
export async function quitarInscripcion(inscripcionId: number, academiaId: number): Promise<AcademiaFormState> {
  await requireRole(EDITA);
  const supabase = await createClient();
  const { error } = await supabase.from("inscripciones").delete().eq("id", inscripcionId);
  if (error) return { error: error.message };
  await logAudit({ action: "academia.desinscribir", entity: "inscripciones", entityId: String(inscripcionId) });
  // "layout" para que también se refresque la ficha del grupo, que es de donde
  // se retira en la práctica.
  revalidatePath("/academias", "layout");
  revalidatePath(`/academias/${academiaId}`);
  return { ok: "Retirado de la academia." };
}

export async function addListaEspera(
  _prev: AcademiaFormState,
  formData: FormData,
): Promise<AcademiaFormState> {
  await requireRole(EDITA);
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
  await requireRole(EDITA);
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
  await requireRole(EDITA);
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

// ─────────────────────────────────────────────────────────────
// Inscribir en un GRUPO (modelo nuevo: el horario es del grupo)
// ─────────────────────────────────────────────────────────────

export type NinoInfo = { nombre: string; edad: number | null; clienteId: number };

/** Datos del niño para ordenar los grupos por lo que le sirve a su edad. */
export async function datosDelNino(miembroId: number): Promise<NinoInfo | null> {
  await requireRole(EDITA);
  const supabase = await createClient();
  const { data } = await supabase
    .from("cliente_miembros")
    .select("cliente_id, nombres, apellidos, fecha_nacimiento")
    .eq("id", miembroId)
    .maybeSingle();
  if (!data) return null;
  let edad: number | null = null;
  if (data.fecha_nacimiento) {
    const n = new Date(`${data.fecha_nacimiento}T00:00:00`);
    const hoy = new Date();
    edad = hoy.getFullYear() - n.getFullYear() -
      (hoy < new Date(hoy.getFullYear(), n.getMonth(), n.getDate()) ? 1 : 0);
  }
  return { nombre: `${data.apellidos}, ${data.nombres}`, edad, clienteId: data.cliente_id };
}

/**
 * Inscribe un niño en un grupo y en las franjas que escoja.
 *
 * El cupo NO bloquea (decisión de Laura): si la franja está llena igual entra,
 * la pantalla ya lo avisó antes de confirmar. Lo que sí bloquea es la base:
 * un niño no puede estar en dos academias del mismo deporte.
 */
export async function inscribirEnGrupo(input: {
  academiaId: number;
  grupoId: number;
  miembroId: number;
  franjaIds: number[];
}): Promise<AcademiaFormState> {
  await requireRole(EDITA);
  if (!input.miembroId) return { error: "Escoge al niño." };
  if (!input.grupoId) return { error: "Escoge el grupo." };
  if (!input.franjaIds.length) return { error: "Escoge al menos un día." };

  const supabase = await createClient();
  const { data: m } = await supabase
    .from("cliente_miembros")
    .select("id, cliente_id")
    .eq("id", input.miembroId)
    .maybeSingle();
  if (!m) return { error: "No se encontró a esa persona." };

  // Idempotente: si ya estaba inscrito en esta academia, se le cambia el grupo
  // en vez de crear una segunda inscripción.
  const { data: ya } = await supabase
    .from("inscripciones")
    .select("id")
    .eq("academia_id", input.academiaId)
    .eq("miembro_id", input.miembroId)
    .maybeSingle();

  let inscripcionId: number;
  if (ya) {
    const { error } = await supabase
      .from("inscripciones")
      .update({ grupo_id: input.grupoId, activa: true })
      .eq("id", ya.id);
    if (error) return { error: errorInscripcion(error.message) };
    inscripcionId = ya.id;
  } else {
    const { data: ins, error } = await supabase
      .from("inscripciones")
      .insert({
        academia_id: input.academiaId,
        cliente_id: m.cliente_id,
        miembro_id: input.miembroId,
        grupo_id: input.grupoId,
      })
      .select("id")
      .single();
    if (error || !ins) return { error: errorInscripcion(error?.message ?? "No se pudo inscribir.") };
    inscripcionId = ins.id;
  }

  // Las franjas escogidas reemplazan a las que tuviera de este grupo.
  const { data: previas } = await supabase
    .from("inscripcion_franja")
    .select("id, franja_id, grupo_franja!inner(grupo_id)")
    .eq("inscripcion_id", inscripcionId);
  const sobran = (previas ?? [])
    .filter((p) => !input.franjaIds.includes(p.franja_id))
    .map((p) => p.id);
  if (sobran.length) await supabase.from("inscripcion_franja").delete().in("id", sobran);

  const yaTiene = new Set((previas ?? []).map((p) => p.franja_id));
  const nuevas = input.franjaIds.filter((f) => !yaTiene.has(f));
  if (nuevas.length) {
    const { error } = await supabase
      .from("inscripcion_franja")
      .insert(nuevas.map((franja_id) => ({ inscripcion_id: inscripcionId, franja_id })));
    if (error) return { error: error.message };
  }

  await logAudit({
    action: "academia.inscribir_grupo",
    entity: "inscripciones",
    entityId: String(inscripcionId),
    after: { grupo_id: input.grupoId, franjas: input.franjaIds.length },
  });
  revalidatePath(`/academias/${input.academiaId}`);
  revalidatePath(`/academias/${input.academiaId}/grupos/${input.grupoId}`);
  return { ok: `Inscrito con ${input.franjaIds.length} ${input.franjaIds.length === 1 ? "día" : "días"}.` };
}

// ─────────────────────────────────────────────────────────────
// Grupos y sus franjas
// ─────────────────────────────────────────────────────────────

/**
 * Un grupo es EDAD + NIVEL, y su nombre es solo una etiqueta para hablar de él
 * ("los Simba"). Por eso el nombre es libre y editable: lo que ordena el grupo
 * son las otras dos columnas, no cómo se llame.
 */
export async function guardarGrupo(
  _prev: AcademiaFormState,
  formData: FormData,
): Promise<AcademiaFormState> {
  await requireRole(EDITA);
  const academiaId = Number(formData.get("academiaId"));
  const grupoId = Number(formData.get("grupoId")) || null;
  const nombre = String(formData.get("nombre") || "").trim();
  const nivel = String(formData.get("nivel") || "") as AcademiaNivel;
  const edadMin = Number(formData.get("edadMin"));
  const edadMax = Number(formData.get("edadMax"));

  const fieldErrors: Record<string, string> = {};
  if (nombre.length < 2) fieldErrors.nombre = "Ponle un nombre.";
  if (!NIVELES_GRUPO.some((n) => n.value === nivel)) fieldErrors.nivel = "Escoge el nivel.";
  if (!Number.isInteger(edadMin) || edadMin < 3 || edadMin > 99) fieldErrors.edadMin = "Edad inválida.";
  if (!Number.isInteger(edadMax) || edadMax < 3 || edadMax > 99) fieldErrors.edadMax = "Edad inválida.";
  if (!fieldErrors.edadMin && !fieldErrors.edadMax && edadMax < edadMin) {
    fieldErrors.edadMax = "La edad máxima no puede ser menor que la mínima.";
  }
  if (Object.keys(fieldErrors).length) return { error: "Revisa los campos.", fieldErrors };

  const supabase = await createClient();
  const fila = { academia_id: academiaId, nombre, nivel, edad_min: edadMin, edad_max: edadMax };

  if (grupoId) {
    const { error } = await supabase.from("academia_grupo").update(fila).eq("id", grupoId);
    if (error) return { error: errorGrupo(error.message) };
    await logAudit({ action: "grupo.update", entity: "academia_grupo", entityId: String(grupoId), after: fila });
    revalidatePath(`/academias/${academiaId}/grupos/${grupoId}`);
    revalidatePath(`/academias/${academiaId}`);
    redirect(`/academias/${academiaId}/grupos/${grupoId}`);
  }

  const { data: g, error } = await supabase.from("academia_grupo").insert(fila).select("id").single();
  if (error || !g) return { error: errorGrupo(error?.message ?? "No se pudo crear el grupo.") };
  await logAudit({ action: "grupo.create", entity: "academia_grupo", entityId: String(g.id), after: fila });
  revalidatePath(`/academias/${academiaId}`);
  redirect(`/academias/${academiaId}/grupos/${g.id}/franjas`);
}

/** El trigger de la base y el índice único hablan en jerga: se traducen. */
function errorGrupo(msg: string): string {
  if (/iniciación/i.test(msg)) return msg.replace(/^.*?:\s*/, "");
  if (/academia_grupo_nombre|duplicate|unique/i.test(msg)) return "Ya hay un grupo con ese nombre en esta academia.";
  return msg;
}

/** Borra un grupo. Solo si está vacío: si tiene niños, primero hay que moverlos. */
export async function eliminarGrupo(grupoId: number, academiaId: number): Promise<AcademiaFormState> {
  await requireRole(EDITA);
  const supabase = await createClient();
  const { count } = await supabase
    .from("inscripciones")
    .select("*", { count: "exact", head: true })
    .eq("grupo_id", grupoId)
    .eq("activa", true);
  if ((count ?? 0) > 0) {
    return {
      error: `Este grupo todavía tiene ${count} ${count === 1 ? "niño inscrito" : "niños inscritos"}. Muévelos a otro grupo antes de borrarlo.`,
    };
  }
  const { error } = await supabase.from("academia_grupo").delete().eq("id", grupoId);
  if (error) return { error: error.message };
  await logAudit({ action: "grupo.delete", entity: "academia_grupo", entityId: String(grupoId) });
  revalidatePath(`/academias/${academiaId}`);
  redirect(`/academias/${academiaId}`);
}

/**
 * Crea o edita una franja del grupo. `cupo` va vacío casi siempre: null = el tope
 * del nivel (Iniciación 6 · Intermedio 5 · Avanzado 4). Solo se llena la excepción.
 */
export async function guardarFranja(
  _prev: AcademiaFormState,
  formData: FormData,
): Promise<AcademiaFormState> {
  await requireRole(EDITA);
  const academiaId = Number(formData.get("academiaId"));
  const grupoId = Number(formData.get("grupoId"));
  const franjaId = Number(formData.get("franjaId")) || null;
  const dia = Number(formData.get("dia"));
  const hora = String(formData.get("hora") || "");
  const duracion = Number(formData.get("duracion"));
  const profesorId = String(formData.get("profesorId") || "");
  const cancha = String(formData.get("cancha") || "").trim();
  const cupo = Number(formData.get("cupo")) || null;

  if (!grupoId) return { error: "Grupo inválido." };
  if (!Number.isInteger(dia) || dia < 0 || dia > 6) return { error: "Escoge el día." };
  if (!/^\d{2}:\d{2}$/.test(hora)) return { error: "Escoge la hora." };
  if (![60, 90, 120].includes(duracion)) return { error: "Escoge cuánto dura." };

  const [h, m] = hora.split(":").map(Number);
  const fin = h * 60 + m + duracion;
  if (fin > 24 * 60) return { error: "La clase se sale del día." };
  const horaFin = `${String(Math.floor(fin / 60)).padStart(2, "0")}:${String(fin % 60).padStart(2, "0")}`;

  const fila = {
    grupo_id: grupoId,
    dia_semana: dia,
    hora_inicio: `${hora}:00`,
    hora_fin: `${horaFin}:00`,
    profesor_id: profesorId || null,
    cancha: cancha || null,
    cupo,
  };

  const supabase = await createClient();
  const { error } = franjaId
    ? await supabase.from("grupo_franja").update(fila).eq("id", franjaId)
    : await supabase.from("grupo_franja").insert(fila);
  if (error) {
    return {
      error: /duplicate|unique/i.test(error.message)
        ? "Este grupo ya tiene una franja ese día a esa hora."
        : error.message,
    };
  }

  await logAudit({
    action: franjaId ? "franja.update" : "franja.create",
    entity: "grupo_franja",
    entityId: String(franjaId ?? grupoId),
    after: fila,
  });
  revalidatePath(`/academias/${academiaId}/grupos/${grupoId}`);
  revalidatePath(`/academias/${academiaId}/grupos/${grupoId}/franjas`);
  revalidatePath(`/academias/${academiaId}`);
  return { ok: franjaId ? "Franja actualizada." : "Franja agregada." };
}

/**
 * Borra una franja. Se lleva en cascada a quién estaba apuntado a ELLA, no su
 * inscripción: el niño sigue en el grupo, queda sin ese día (y el detalle del
 * grupo lo avisa en el bloque de "sin franja asignada").
 */
export async function eliminarFranja(franjaId: number, grupoId: number, academiaId: number): Promise<AcademiaFormState> {
  await requireRole(EDITA);
  const supabase = await createClient();
  const { count } = await supabase
    .from("inscripcion_franja")
    .select("*", { count: "exact", head: true })
    .eq("franja_id", franjaId);
  const { error } = await supabase.from("grupo_franja").delete().eq("id", franjaId);
  if (error) return { error: error.message };
  await logAudit({ action: "franja.delete", entity: "grupo_franja", entityId: String(franjaId) });
  revalidatePath(`/academias/${academiaId}/grupos/${grupoId}`);
  revalidatePath(`/academias/${academiaId}/grupos/${grupoId}/franjas`);
  revalidatePath(`/academias/${academiaId}`);
  return {
    ok: (count ?? 0) > 0
      ? `Franja borrada. ${count} ${count === 1 ? "niño quedó" : "niños quedaron"} sin ese día (siguen en el grupo).`
      : "Franja borrada.",
  };
}
