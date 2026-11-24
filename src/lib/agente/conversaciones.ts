import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { Mensaje } from "./enrutador";
import { fuentesDe, type MensajeVista } from "./protocolo";
import type { NuevoMensaje, Repositorio } from "./servicio";

/**
 * Las conversaciones guardadas del agente (migración 20261124100000).
 *
 * LEER va con la sesión de quien pregunta: la RLS solo le deja ver las suyas
 * (decisión de Laura: cada superadministrador ve solo sus conversaciones), y además
 * se filtra por su id, que es lo que vale cuando la pantalla se prueba con
 * service_role. ESCRIBIR va con service_role: nadie con sesión tiene permiso de
 * escribir en esas tablas, a propósito. La ruta valida el rol ANTES de escribir.
 */

type Cliente = SupabaseClient<Database>;

export function repositorio(sesion: Cliente, admin: Cliente): Repositorio {
  return {
    async esDuena(conversacionId, perfilId) {
      const { data, error } = await sesion
        .from("agente_conversacion")
        .select("id")
        .eq("id", conversacionId)
        .eq("perfil_id", perfilId)
        .maybeSingle();
      if (error) throw new Error(`No se pudo leer la conversación: ${error.message}`);
      return !!data;
    },
    async crear(perfilId, titulo) {
      const { data, error } = await admin.from("agente_conversacion").insert({ perfil_id: perfilId, titulo }).select("id").single();
      if (error || !data) throw new Error(`No se pudo crear la conversación: ${error?.message}`);
      return data.id;
    },
    async historial(conversacionId, limite) {
      const { data, error } = await sesion
        .from("agente_mensaje")
        .select("rol, contenido")
        .eq("conversacion_id", conversacionId)
        .order("id", { ascending: false })
        .limit(limite);
      if (error) throw new Error(`No se pudo leer la conversación: ${error.message}`);
      return (data ?? []).reverse().map((m): Mensaje => ({ rol: m.rol, contenido: m.contenido }));
    },
    async guardar(m: NuevoMensaje) {
      const { data, error } = await admin.from("agente_mensaje").insert(m).select("id, created_at").single();
      if (error || !data) throw new Error(`No se pudo guardar el mensaje: ${error?.message}`);
      return data;
    },
    async tocar(conversacionId) {
      const { error } = await admin
        .from("agente_conversacion")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversacionId);
      if (error) throw new Error(`No se pudo actualizar la conversación: ${error.message}`);
    },
  };
}

export type ConversacionVista = { id: number; titulo: string; updated_at: string };

/** Las conversaciones de una persona, la más reciente primero. */
export async function listarConversaciones(sesion: Cliente, perfilId: string, limite = 50): Promise<ConversacionVista[]> {
  const { data, error } = await sesion
    .from("agente_conversacion")
    .select("id, titulo, updated_at")
    .eq("perfil_id", perfilId)
    .order("updated_at", { ascending: false })
    .limit(limite);
  if (error) throw new Error(`No se pudieron leer las conversaciones: ${error.message}`);
  return data ?? [];
}

/** Los mensajes de una conversación suya, o null si no existe o no es suya. */
export async function leerConversacion(
  sesion: Cliente,
  perfilId: string,
  conversacionId: number,
): Promise<{ titulo: string; mensajes: MensajeVista[] } | null> {
  const { data: c, error } = await sesion
    .from("agente_conversacion")
    .select("id, titulo")
    .eq("id", conversacionId)
    .eq("perfil_id", perfilId)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer la conversación: ${error.message}`);
  if (!c) return null;
  const { data, error: e2 } = await sesion
    .from("agente_mensaje")
    .select("id, rol, contenido, herramientas, created_at")
    .eq("conversacion_id", conversacionId)
    .order("id");
  if (e2) throw new Error(`No se pudieron leer los mensajes: ${e2.message}`);
  return {
    titulo: c.titulo,
    mensajes: (data ?? []).map((m) => ({
      id: m.id,
      rol: m.rol,
      contenido: m.contenido,
      fuentes: m.rol === "agente" ? fuentesDe(m.herramientas) : [],
      created_at: m.created_at,
    })),
  };
}
