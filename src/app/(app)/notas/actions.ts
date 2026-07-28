"use server";

import { revalidatePath } from "next/cache";
import { getProfile, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { contarNoLeidas, listarNotas } from "@/lib/notas";
import type { NotaPrioridad } from "@/lib/database.types";

export type NotaState = { error?: string; ok?: string };

const MAX_TEXTO = 2000;

/** Refresca la bandeja y el contador de la campanita (vive en el layout). */
function revalidarNotas() {
  revalidatePath("/", "layout");
}

function leerPrioridad(formData: FormData): NotaPrioridad {
  return formData.get("prioridad") === "alta" ? "alta" : "normal";
}

/** Ids de perfil etiquetados (@), sin repetidos y sin el propio autor. */
function leerDestinatarios(formData: FormData, autorId: string): string[] {
  const ids = formData.getAll("destinatario").map(String).filter(Boolean);
  return [...new Set(ids)].filter((id) => id !== autorId);
}

/** Enganche opcional de la nota. Solo se guarda uno (cliente > clase > evento). */
function leerEnlace(formData: FormData) {
  const clienteId = Number(formData.get("cliente_id")) || null;
  const claseId = Number(formData.get("clase_id")) || null;
  const eventoId = Number(formData.get("evento_id")) || null;
  if (clienteId) return { cliente_id: clienteId, clase_id: null, evento_id: null };
  if (claseId) return { cliente_id: null, clase_id: claseId, evento_id: null };
  if (eventoId) return { cliente_id: null, clase_id: null, evento_id: eventoId };
  return { cliente_id: null, clase_id: null, evento_id: null };
}

/**
 * Reparte la nota. Si nadie fue etiquetado va al tablón general: se avisa a
 * todo el staff activo (menos al autor, que no se notifica a sí mismo).
 */
async function repartir(notaId: number, destinatarios: string[], autorId: string) {
  const supabase = await createClient();
  let ids = destinatarios;
  if (ids.length === 0) {
    const { data: staff } = await supabase.rpc("staff_directorio");
    ids = (staff ?? []).map((p) => p.id).filter((id) => id !== autorId);
  }
  if (ids.length === 0) return;
  await supabase
    .from("nota_destinatarios")
    .insert(ids.map((perfil_id) => ({ nota_id: notaId, perfil_id })));
}

export async function crearNota(_prev: NotaState, formData: FormData): Promise<NotaState> {
  const perfil = await requireProfile();
  const texto = String(formData.get("texto") || "").trim();
  if (!texto) return { error: "Escribe la nota antes de guardarla." };
  if (texto.length > MAX_TEXTO) return { error: `La nota no puede pasar de ${MAX_TEXTO} caracteres.` };

  const destinatarios = leerDestinatarios(formData, perfil.id);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notas")
    .insert({
      texto,
      autor_id: perfil.id,
      prioridad: leerPrioridad(formData),
      para_todos: destinatarios.length === 0,
      ...leerEnlace(formData),
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  await repartir(data.id, destinatarios, perfil.id);
  await logAudit({
    action: "nota.crear",
    entity: "notas",
    entityId: String(data.id),
    after: { destinatarios: destinatarios.length, para_todos: destinatarios.length === 0 },
  });
  revalidarNotas();
  return {
    ok: destinatarios.length
      ? "Nota enviada a los responsables."
      : "Nota publicada en el tablón para todo el equipo.",
  };
}

export async function editarNota(_prev: NotaState, formData: FormData): Promise<NotaState> {
  const perfil = await requireProfile();
  const id = Number(formData.get("id"));
  const texto = String(formData.get("texto") || "").trim();
  if (!id) return { error: "Nota inválida." };
  if (!texto) return { error: "La nota no puede quedar vacía." };
  if (texto.length > MAX_TEXTO) return { error: `La nota no puede pasar de ${MAX_TEXTO} caracteres.` };

  const destinatarios = leerDestinatarios(formData, perfil.id);
  const supabase = await createClient();
  const { error } = await supabase
    .from("notas")
    .update({
      texto,
      prioridad: leerPrioridad(formData),
      para_todos: destinatarios.length === 0,
      editada_el: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: error.message };

  // Re-etiquetar: se rehace la lista. Quien siga etiquetado conserva su
  // "leída" (upsert ignora duplicados); los nuevos entran sin leer.
  const { data: previos } = await supabase
    .from("nota_destinatarios")
    .select("perfil_id")
    .eq("nota_id", id);
  const antes = new Set((previos ?? []).map((d) => d.perfil_id));

  if (destinatarios.length > 0) {
    const sobran = [...antes].filter((p) => !destinatarios.includes(p));
    if (sobran.length) {
      await supabase.from("nota_destinatarios").delete().eq("nota_id", id).in("perfil_id", sobran);
    }
    const nuevos = destinatarios.filter((p) => !antes.has(p));
    if (nuevos.length) {
      await supabase
        .from("nota_destinatarios")
        .insert(nuevos.map((perfil_id) => ({ nota_id: id, perfil_id })));
    }
  } else {
    await repartir(id, [], perfil.id);
  }

  await logAudit({ action: "nota.editar", entity: "notas", entityId: String(id) });
  revalidarNotas();
  return { ok: "Nota actualizada." };
}

export async function resolverNota(_prev: NotaState, formData: FormData): Promise<NotaState> {
  const perfil = await requireProfile();
  const id = Number(formData.get("id"));
  if (!id) return { error: "Nota inválida." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("notas")
    .update({ estado: "resuelta", resuelta_por: perfil.id, resuelta_el: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  // Al resolverla deja de pedir atención: se da por leída para todos.
  await supabase
    .from("nota_destinatarios")
    .update({ leida_el: new Date().toISOString() })
    .eq("nota_id", id)
    .eq("perfil_id", perfil.id)
    .is("leida_el", null);
  await logAudit({ action: "nota.resolver", entity: "notas", entityId: String(id) });
  revalidarNotas();
  return { ok: "Nota marcada como resuelta." };
}

export async function reabrirNota(_prev: NotaState, formData: FormData): Promise<NotaState> {
  await requireProfile();
  const id = Number(formData.get("id"));
  if (!id) return { error: "Nota inválida." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("notas")
    .update({ estado: "pendiente", resuelta_por: null, resuelta_el: null })
    .eq("id", id);
  if (error) return { error: error.message };
  await logAudit({ action: "nota.reabrir", entity: "notas", entityId: String(id) });
  revalidarNotas();
  return { ok: "Nota reabierta." };
}

export async function eliminarNota(_prev: NotaState, formData: FormData): Promise<NotaState> {
  await requireProfile();
  const id = Number(formData.get("id"));
  if (!id) return { error: "Nota inválida." };
  const supabase = await createClient();
  // Los destinatarios caen solos (on delete cascade).
  const { error } = await supabase.from("notas").delete().eq("id", id);
  if (error) return { error: error.message };
  await logAudit({ action: "nota.eliminar", entity: "notas", entityId: String(id) });
  revalidarNotas();
  return { ok: "Nota eliminada." };
}

// ───────────────────────── Comentarios (hilo de la nota) ─────────────────────────

const MAX_COMENTARIO = 1000;

export type ComentarioVista = {
  id: number;
  autorNombre: string;
  texto: string;
  createdAt: string;
  editadoEl: string | null;
  puedeEditar: boolean;
  puedeEliminar: boolean;
};

/**
 * Hilo de una nota. Se pide al desplegar, no viene con el listado.
 * Solo lee: si la sesión venció devuelve vacío en vez de expulsar al login
 * (desplegar un hilo no debería sacarte de donde estabas).
 */
export async function comentariosDeNota(notaId: number): Promise<ComentarioVista[]> {
  const perfil = await getProfile();
  if (!perfil) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("nota_comentarios_listar", { p_nota_id: notaId });
  return (data ?? []).map((c) => ({
    id: c.id,
    autorNombre: c.autor_nombre ?? "Alguien del equipo",
    texto: c.texto,
    createdAt: c.created_at,
    editadoEl: c.editado_el,
    // Un comentario solo lo reescribe quien lo escribió; borrar también puede el superadmin.
    puedeEditar: c.autor_id === perfil.id,
    puedeEliminar: c.autor_id === perfil.id || perfil.role === "superadmin",
  }));
}

/**
 * Comenta una nota. Va por el RPC `nota_comentar` porque además de guardar el
 * texto reparte el aviso: la nota vuelve a quedar "sin abrir" para el autor,
 * los que ya habían comentado y los etiquetados — nunca para todo el tablón.
 */
export async function comentarNota(_prev: NotaState, formData: FormData): Promise<NotaState> {
  const perfil = await requireProfile();
  const notaId = Number(formData.get("nota_id"));
  const texto = String(formData.get("texto") || "").trim();
  if (!notaId) return { error: "Nota inválida." };
  if (!texto) return { error: "Escribe el comentario antes de enviarlo." };
  if (texto.length > MAX_COMENTARIO) {
    return { error: `El comentario no puede pasar de ${MAX_COMENTARIO} caracteres.` };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("nota_comentar", {
    p_nota_id: notaId,
    p_texto: texto,
    p_destinatarios: leerDestinatarios(formData, perfil.id),
  });
  if (error) return { error: error.message };

  await logAudit({ action: "nota.comentar", entity: "nota_comentarios", entityId: String(notaId) });
  revalidarNotas();
  return { ok: "Comentario publicado." };
}

export async function editarComentario(_prev: NotaState, formData: FormData): Promise<NotaState> {
  await requireProfile();
  const id = Number(formData.get("id"));
  const texto = String(formData.get("texto") || "").trim();
  if (!id) return { error: "Comentario inválido." };
  if (!texto) return { error: "El comentario no puede quedar vacío." };
  if (texto.length > MAX_COMENTARIO) {
    return { error: `El comentario no puede pasar de ${MAX_COMENTARIO} caracteres.` };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("nota_comentarios")
    .update({ texto, editado_el: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidarNotas();
  return { ok: "Comentario actualizado." };
}

export async function eliminarComentario(_prev: NotaState, formData: FormData): Promise<NotaState> {
  await requireProfile();
  const id = Number(formData.get("id"));
  if (!id) return { error: "Comentario inválido." };
  const supabase = await createClient();
  const { error } = await supabase.from("nota_comentarios").delete().eq("id", id);
  if (error) return { error: error.message };
  await logAudit({ action: "nota.comentario_eliminar", entity: "nota_comentarios", entityId: String(id) });
  revalidarNotas();
  return { ok: "Comentario eliminado." };
}

/** Contador de la campanita, para refrescarlo desde el navegador. */
export async function contarNoLeidasAction(): Promise<number> {
  const perfil = await requireProfile();
  return contarNoLeidas(perfil.id);
}

export type NotaAviso = {
  id: number;
  texto: string;
  autorNombre: string;
  prioridad: NotaPrioridad;
  createdAt: string;
  paraTodos: boolean;
};

/**
 * Notas sin abrir del usuario, para el desplegable de la campanita.
 * Usa el filtro `sin_leer` (no `mias`) para que una nota YA RESUELTA con un
 * comentario nuevo también aparezca: si no, el contador subía y la lista salía vacía.
 */
export async function notasNoLeidasAction(): Promise<NotaAviso[]> {
  const perfil = await requireProfile();
  const notas = await listarNotas({
    filtro: "sin_leer",
    perfilId: perfil.id,
    role: perfil.role,
    limite: 20,
  });
  return notas
    .filter((n) => !n.leidaPorMi)
    .map((n) => ({
      id: n.id,
      texto: n.texto,
      autorNombre: n.autorNombre,
      prioridad: n.prioridad,
      createdAt: n.createdAt,
      paraTodos: n.paraTodos,
    }));
}

/**
 * Marca como leídas las notas del usuario. Leer NO es resolver: la nota sigue
 * pendiente en la bandeja, solo deja de contar en la campanita.
 */
export async function marcarLeidas(notaIds?: number[]): Promise<void> {
  const perfil = await requireProfile();
  const supabase = await createClient();
  let q = supabase
    .from("nota_destinatarios")
    .update({ leida_el: new Date().toISOString() })
    .eq("perfil_id", perfil.id)
    .is("leida_el", null);
  if (notaIds?.length) q = q.in("nota_id", notaIds);
  await q;
  revalidarNotas();
}
