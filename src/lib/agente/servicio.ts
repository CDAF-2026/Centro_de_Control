import type { Json } from "@/lib/database.types";
import type { Mensaje } from "./enrutador";
import type { EventoAgente, RespuestaAgente } from "./motor";
import { fuentesDe, type LineaChat, type MensajeVista } from "./protocolo";

/**
 * Atender una pregunta de punta a punta: conversación, historial, guardar la
 * pregunta, correr el agente, guardar la respuesta y avisarle a la pantalla.
 *
 * No toca la base ni OpenAI directamente: todo entra por `deps`, así se prueba sin
 * gastar ni escribir en producción (tests/agente-servicio.test.ts). La ruta
 * `/agente/chat` le pasa las piezas de verdad (`conversaciones.ts` y el motor).
 */

export const MAX_PREGUNTA = 4000;
/** Mensajes previos que se le dan al agente como contexto (los más recientes). */
export const MAX_HISTORIAL = 12;

export type NuevoMensaje = {
  conversacion_id: number;
  rol: "usuario" | "agente";
  contenido: string;
  herramientas?: Json;
  modelo?: string | null;
  tokens_entrada?: number | null;
  tokens_cache?: number | null;
  tokens_salida?: number | null;
  costo_usd?: number | null;
};

export type Repositorio = {
  /** ¿La conversación existe y es de esta persona? */
  esDuena(conversacionId: number, perfilId: string): Promise<boolean>;
  crear(perfilId: string, titulo: string): Promise<number>;
  historial(conversacionId: number, limite: number): Promise<Mensaje[]>;
  guardar(m: NuevoMensaje): Promise<{ id: number; created_at: string }>;
  tocar(conversacionId: number): Promise<void>;
};

export type Dependencias = {
  repo: Repositorio;
  correr: (a: { pregunta: string; historial: Mensaje[]; alEvento: (e: EventoAgente) => void }) => Promise<RespuestaAgente>;
  emitir: (linea: LineaChat) => void;
  /** Para la bitácora (no debe tumbar la respuesta si falla). */
  registrar?: (a: { conversacionId: number; pregunta: string; r: RespuestaAgente }) => Promise<void>;
};

/** El título de una conversación nueva: la primera pregunta, recortada. */
export function tituloDe(pregunta: string): string {
  const limpio = pregunta.replace(/\s+/g, " ").trim();
  return limpio.length > 80 ? `${limpio.slice(0, 79).trimEnd()}…` : limpio;
}

const MENSAJE_FALLO =
  "No pude responder esta pregunta: el servicio de inteligencia artificial falló. Inténtalo de nuevo en un momento.";

export async function atenderPregunta(
  entrada: { pregunta: string; conversacionId: number | null; perfilId: string },
  deps: Dependencias,
): Promise<void> {
  const { repo, emitir } = deps;
  const pregunta = entrada.pregunta.trim();

  let conversacionId = entrada.conversacionId;
  let historial: Mensaje[] = [];
  if (conversacionId != null) {
    if (!(await repo.esDuena(conversacionId, entrada.perfilId))) {
      emitir({ tipo: "error", mensaje: "Esa conversación no existe." });
      return;
    }
    historial = await repo.historial(conversacionId, MAX_HISTORIAL);
  } else {
    conversacionId = await repo.crear(entrada.perfilId, tituloDe(pregunta));
  }

  const p = await repo.guardar({ conversacion_id: conversacionId, rol: "usuario", contenido: pregunta });
  emitir({
    tipo: "inicio",
    conversacionId,
    pregunta: { id: p.id, rol: "usuario", contenido: pregunta, fuentes: [], created_at: p.created_at },
  });

  let r: RespuestaAgente;
  try {
    r = await deps.correr({
      pregunta,
      historial,
      alEvento: (e) => {
        // La ruta (qué modelo) no viaja: el reparto es invisible para quien pregunta.
        if (e.tipo === "herramienta") emitir({ tipo: "consultando", etiqueta: e.etiqueta });
        else if (e.tipo === "texto") emitir({ tipo: "texto", delta: e.delta });
        else if (e.tipo === "texto_descartado") emitir({ tipo: "texto_descartado" });
      },
    });
  } catch (e) {
    console.error("[agente] la pregunta falló:", e instanceof Error ? e.message : e);
    // Se guarda también el fallo: si no, al volver a la conversación quedaría una
    // pregunta sin respuesta y sin explicación.
    await repo.guardar({ conversacion_id: conversacionId, rol: "agente", contenido: MENSAJE_FALLO }).catch(() => null);
    await repo.tocar(conversacionId).catch(() => {});
    emitir({ tipo: "error", mensaje: MENSAJE_FALLO });
    return;
  }

  const herramientas = r.herramientas as unknown as Json;
  const g = await repo.guardar({
    conversacion_id: conversacionId,
    rol: "agente",
    contenido: r.texto,
    herramientas,
    modelo: r.modelo,
    tokens_entrada: r.uso.entrada,
    tokens_cache: r.uso.cache,
    tokens_salida: r.uso.salida,
    costo_usd: Number(r.costoUsd.toFixed(6)),
  });
  await repo.tocar(conversacionId);
  await deps.registrar?.({ conversacionId, pregunta, r }).catch(() => {});

  const respuesta: MensajeVista = {
    id: g.id,
    rol: "agente",
    contenido: r.texto,
    fuentes: fuentesDe(r.herramientas),
    created_at: g.created_at,
  };
  emitir({ tipo: "fin", respuesta });
}
