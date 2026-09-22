"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { createAcademiaSchema } from "@/lib/validations/academia";
import type { AppRole } from "@/lib/database.types";

// Una sola puerta, derivada de la matriz. Inscribir a alguien ES editar la
// academia, así que va con el mismo permiso (no hay una lista aparte: esa fue
// la fuga por la que recepción seguía matriculando con el módulo en L).
const EDITA: AppRole[] = rolesForModule("academias", "edit");

export type AcademiaFormState = {
  error?: string;
  ok?: string;
  fieldErrors?: Record<string, string>;
};

/** Refresca todo el módulo: el planeador, la semana del profe y la ficha de la clase. */
function refrescar() {
  revalidatePath("/academias", "layout");
}

// ─────────────────────────────────────────────────────────────
// La academia (Recreativa / Competencia × deporte) — el lado del dinero
// ─────────────────────────────────────────────────────────────

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
  const { count } = await supabase.from("academias").select("*", { count: "exact", head: true });
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

  await logAudit({ action: "academia.create", entity: "academias", entityId: String(ac.id), after: { codigo, nombre: d.nombre } });
  refrescar();
  redirect(`/academias/${ac.id}`);
}

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
  refrescar();
  redirect(`/academias/${id}`);
}

export async function eliminarAcademia(academiaId: number): Promise<AcademiaFormState> {
  await requireRole(EDITA);
  if (!academiaId) return { error: "Academia inválida." };
  const supabase = await createClient();

  const { count } = await supabase
    .from("inscripciones")
    .select("*", { count: "exact", head: true })
    .eq("academia_id", academiaId)
    .eq("activa", true);
  if ((count ?? 0) > 0) {
    return { error: `Esta academia todavía tiene ${count} ${count === 1 ? "niño matriculado" : "niños matriculados"}. Retíralos o muévelos antes de borrarla.` };
  }

  // Se conserva el historial: las clases ya dictadas se desligan en vez de irse
  // en cascada, porque son lo que se liquida.
  await supabase.from("clases").update({ academia_id: null }).eq("academia_id", academiaId).neq("estado", "programada");
  const { error } = await supabase.from("academias").delete().eq("id", academiaId);
  if (error) return { error: error.message };

  await logAudit({ action: "academia.delete", entity: "academias", entityId: String(academiaId) });
  refrescar();
  redirect("/academias");
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
    edad: Number(formData.get("edad")) || null,
    disponibilidad: String(formData.get("disponibilidad") || "") || null,
  });
  if (error) return { error: error.message };
  await logAudit({ action: "academia.lista_espera", entity: "lista_espera", entityId: String(academiaId) });
  revalidatePath(`/academias/${academiaId}`);
  return { ok: "Agregado a la lista de espera." };
}

export async function quitarDeListaEspera(id: number, academiaId: number): Promise<AcademiaFormState> {
  await requireRole(EDITA);
  const supabase = await createClient();
  const { error } = await supabase.from("lista_espera").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/academias/${academiaId}`);
  return { ok: "Quitado de la lista." };
}

// ─────────────────────────────────────────────────────────────
// La clase del planeador: profesor + día + hora + duración
// ─────────────────────────────────────────────────────────────

/**
 * Crea o edita una clase del planeador.
 *
 * La clase NO pertenece a una academia: pertenece al PROFESOR. En el planeador
 * del club una misma clase mezcla niños de recreativa y de competencia (lunes
 * y miércoles 17:30 de Graciano), así que atarla a una academia partiría en dos
 * lo que en la cancha es una sola clase.
 */
export async function guardarClase(
  _prev: AcademiaFormState,
  formData: FormData,
): Promise<AcademiaFormState> {
  await requireRole(EDITA);
  const claseId = Number(formData.get("claseId")) || null;
  const profesorId = String(formData.get("profesorId") || "");
  const dia = Number(formData.get("dia"));
  const hora = String(formData.get("hora") || "");
  const duracion = Number(formData.get("duracion"));
  const cancha = String(formData.get("cancha") || "").trim();

  const fieldErrors: Record<string, string> = {};
  if (!profesorId) fieldErrors.profesorId = "Escoge el profesor.";
  if (!Number.isInteger(dia) || dia < 0 || dia > 6) fieldErrors.dia = "Escoge el día.";
  if (!/^\d{2}:\d{2}$/.test(hora)) fieldErrors.hora = "Escoge la hora.";
  if (!Number.isInteger(duracion) || duracion < 15 || duracion > 300) fieldErrors.duracion = "Escoge cuánto dura.";
  if (Object.keys(fieldErrors).length) return { error: "Revisa los campos.", fieldErrors };

  const fila = {
    profesor_id: profesorId,
    deporte: "tenis" as const,
    dia_semana: dia,
    hora_inicio: `${hora}:00`,
    duracion_min: duracion,
    cancha: cancha || null,
  };

  const supabase = await createClient();
  const { data, error } = claseId
    ? await supabase.from("clase_semanal").update(fila).eq("id", claseId).select("id").single()
    : await supabase.from("clase_semanal").insert(fila).select("id").single();

  if (error) {
    return {
      error: /duplicate|unique/i.test(error.message)
        ? "Ese profesor ya tiene una clase ese día a esa hora. Un profesor no puede estar en dos canchas a la vez."
        : error.message,
    };
  }

  await logAudit({
    action: claseId ? "clase_semanal.update" : "clase_semanal.create",
    entity: "clase_semanal",
    entityId: String(data?.id ?? claseId),
    after: fila,
  });
  refrescar();
  redirect(`/academias/clase/${data?.id ?? claseId}`);
}

/**
 * Borra una clase del planeador. Se lleva a quién estaba apuntado a ELLA, no su
 * matrícula: el niño sigue en la academia y queda sin ese día. Si era su único
 * día, se avisa con nombre y apellido — desaparecer en silencio de la academia
 * es justo el fallo que este módulo persigue.
 */
export async function eliminarClase(claseId: number): Promise<AcademiaFormState> {
  await requireRole(EDITA);
  const supabase = await createClient();

  const { data: roster } = await supabase.rpc("clase_semanal_roster", { p_clase: claseId });
  const solos = (roster ?? []).filter((n) => n.otras_clases === 0);

  const { error } = await supabase.from("clase_semanal").delete().eq("id", claseId);
  if (error) return { error: error.message };

  await logAudit({ action: "clase_semanal.delete", entity: "clase_semanal", entityId: String(claseId), before: { ninos: roster?.length ?? 0 } });
  refrescar();
  redirect(
    solos.length
      ? `/academias?aviso=${encodeURIComponent(
          `Clase borrada. ${solos.length === 1 ? "Este niño quedó" : "Estos niños quedaron"} sin ningún día: ${solos.map((n) => n.nombre).join(", ")}.`,
        )}`
      : "/academias?aviso=" + encodeURIComponent("Clase borrada."),
  );
}

// ─────────────────────────────────────────────────────────────
// Los niños dentro de una clase
// ─────────────────────────────────────────────────────────────

export type NinoInfo = { nombre: string; edad: number | null; clienteId: number };

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

/** El trigger de la base habla en jerga: se traduce. */
function errorMatricula(msg: string): string {
  if (/una sola academia por deporte/i.test(msg)) return msg.replace(/^.*?:\s*/, "");
  if (/duplicate|unique/i.test(msg)) return "Ese niño ya está en esta clase.";
  return msg;
}

/**
 * Mete un niño a una clase. Si todavía no estaba matriculado en la academia, lo
 * matricula de una: en el mostrador esas dos cosas son un solo gesto, y
 * partirlas en dos pantallas fue lo que dejó niños inscritos sin ningún día.
 */
export async function agregarNinoAClase(input: {
  claseId: number;
  miembroId: number;
  academiaId: number;
}): Promise<AcademiaFormState> {
  await requireRole(EDITA);
  if (!input.miembroId) return { error: "Escoge al niño." };
  if (!input.academiaId) return { error: "Escoge si va en recreativa o en competencia." };

  const supabase = await createClient();
  const { data: m } = await supabase
    .from("cliente_miembros")
    .select("id, cliente_id")
    .eq("id", input.miembroId)
    .maybeSingle();
  if (!m) return { error: "No se encontró a esa persona." };

  const { data: ya } = await supabase
    .from("inscripciones")
    .select("id, academia_id, activa")
    .eq("miembro_id", input.miembroId)
    .eq("academia_id", input.academiaId)
    .maybeSingle();

  let inscripcionId: number;
  if (ya) {
    // Volver a entrar después de retirarse: se reactiva, no se crea otra fila.
    if (!ya.activa) {
      const { error } = await supabase
        .from("inscripciones")
        .update({ activa: true, retirada_el: null })
        .eq("id", ya.id);
      if (error) return { error: errorMatricula(error.message) };
    }
    inscripcionId = ya.id;
  } else {
    const { data: ins, error } = await supabase
      .from("inscripciones")
      .insert({ academia_id: input.academiaId, cliente_id: m.cliente_id, miembro_id: input.miembroId })
      .select("id")
      .single();
    if (error || !ins) return { error: errorMatricula(error?.message ?? "No se pudo matricular.") };
    inscripcionId = ins.id;
  }

  const { error } = await supabase
    .from("inscripcion_clase")
    .insert({ inscripcion_id: inscripcionId, clase_id: input.claseId });
  if (error && !/duplicate|unique/i.test(error.message)) return { error: error.message };

  await logAudit({
    action: "academia.agregar_a_clase",
    entity: "inscripcion_clase",
    entityId: String(inscripcionId),
    after: { clase_id: input.claseId, academia_id: input.academiaId },
  });
  refrescar();
  return { ok: "Agregado a la clase." };
}

/** Lo saca de ESTE día. Sigue matriculado y en sus otras clases. */
export async function quitarDeClase(inscripcionId: number, claseId: number): Promise<AcademiaFormState> {
  await requireRole(EDITA);
  const supabase = await createClient();
  const { error } = await supabase
    .from("inscripcion_clase")
    .delete()
    .eq("inscripcion_id", inscripcionId)
    .eq("clase_id", claseId);
  if (error) return { error: error.message };

  const { count } = await supabase
    .from("inscripcion_clase")
    .select("*", { count: "exact", head: true })
    .eq("inscripcion_id", inscripcionId);

  await logAudit({ action: "academia.quitar_de_clase", entity: "inscripcion_clase", entityId: String(inscripcionId), before: { clase_id: claseId } });
  refrescar();
  return {
    ok: (count ?? 0) === 0
      ? "Quitado de la clase. Ojo: se quedó sin ningún día, sigue matriculado pero no viene a nada."
      : `Quitado de esa clase. Le ${(count ?? 0) === 1 ? "queda 1 día" : `quedan ${count} días`} a la semana.`,
  };
}

/** Cambio de horario: se hace en un paso, no retirando y volviendo a inscribir. */
export async function moverDeClase(input: {
  inscripcionId: number;
  desdeClaseId: number;
  haciaClaseId: number;
}): Promise<AcademiaFormState> {
  await requireRole(EDITA);
  if (input.desdeClaseId === input.haciaClaseId) return { error: "Es la misma clase." };
  const supabase = await createClient();

  const { error } = await supabase
    .from("inscripcion_clase")
    .update({ clase_id: input.haciaClaseId })
    .eq("inscripcion_id", input.inscripcionId)
    .eq("clase_id", input.desdeClaseId);
  if (error) {
    return {
      error: /duplicate|unique/i.test(error.message)
        ? "Ese niño ya estaba en la clase de destino. Quítalo de esta en vez de moverlo."
        : error.message,
    };
  }

  await logAudit({
    action: "academia.mover_de_clase",
    entity: "inscripcion_clase",
    entityId: String(input.inscripcionId),
    before: { clase_id: input.desdeClaseId },
    after: { clase_id: input.haciaClaseId },
  });
  refrescar();
  return { ok: "Movido de clase." };
}

/**
 * Retira a un niño de la academia entera.
 *
 * NO borra: apaga `activa` y sella `retirada_el`. Borrar la inscripción borraría
 * la explicación de la asistencia y del cobro de los meses que ya pasaron.
 */
export async function retirarDeAcademia(inscripcionId: number): Promise<AcademiaFormState> {
  await requireRole(EDITA);
  const supabase = await createClient();
  const hoy = new Date().toISOString().slice(0, 10);
  const { error } = await supabase
    .from("inscripciones")
    .update({ activa: false, retirada_el: hoy })
    .eq("id", inscripcionId);
  if (error) return { error: error.message };

  // Los días quedan libres para otro niño; la matrícula se conserva.
  await supabase.from("inscripcion_clase").delete().eq("inscripcion_id", inscripcionId);

  await logAudit({ action: "academia.retirar", entity: "inscripciones", entityId: String(inscripcionId), after: { retirada_el: hoy } });
  refrescar();
  return { ok: "Retirado de la academia. Su historial queda." };
}

/** Pasa a un niño de recreativa a competencia (o al revés) sin perder sus clases. */
export async function cambiarCategoria(inscripcionId: number, academiaId: number): Promise<AcademiaFormState> {
  await requireRole(EDITA);
  const supabase = await createClient();
  const { error } = await supabase.from("inscripciones").update({ academia_id: academiaId }).eq("id", inscripcionId);
  if (error) return { error: errorMatricula(error.message) };
  await logAudit({ action: "academia.cambiar_categoria", entity: "inscripciones", entityId: String(inscripcionId), after: { academia_id: academiaId } });
  refrescar();
  return { ok: "Cambiado de academia." };
}
