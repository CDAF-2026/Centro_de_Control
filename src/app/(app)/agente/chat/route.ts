import { z } from "zod";
import { getProfile } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { hoyBogota, isoDia } from "@/lib/periodo";
import { clienteOpenAI, responder } from "@/lib/agente/motor";
import { leerConversacion, repositorio } from "@/lib/agente/conversaciones";
import { atenderPregunta, MAX_PREGUNTA } from "@/lib/agente/servicio";
import { codificar, type LineaChat } from "@/lib/agente/protocolo";

/**
 * POST /agente/chat — una pregunta al Agente IA, con la respuesta por partes
 * (una línea JSON por evento, ver protocolo.ts).
 *
 * Es una ruta y no una Server Action porque una acción devuelve la respuesta
 * completa al final; aquí la pantalla tiene que ver qué se está consultando y el
 * texto mientras se escribe (Next 16, route.md → Streaming).
 *
 * El guardia va aquí también (handoff §1.12): el de la página no protege la ruta.
 */

// Una pregunta de análisis tarda 10–30 s, y si el modelo pequeño se la pasa al
// grande, más. 300 s es el tope del plan Pro de Vercel.
export const maxDuration = 300;

const Cuerpo = z.object({
  pregunta: z.string().trim().min(1).max(MAX_PREGUNTA),
  conversacionId: z.number().int().positive().nullable(),
});

async function autorizado() {
  const perfil = await getProfile();
  return perfil && perfil.activo && rolesForModule("agente_ia").includes(perfil.role) ? perfil : null;
}
const NO_AUTORIZADO = () => Response.json({ error: "Solo el superadministrador puede usar el agente." }, { status: 403 });

/**
 * GET /agente/chat?c=<id> — los mensajes de una conversación SUYA. Lo usa la
 * mascota flotante para retomar la conversación de la pestaña después de recargar
 * la página. Ajena o inexistente = 404, sin distinguir.
 */
export async function GET(req: Request) {
  const perfil = await autorizado();
  if (!perfil) return NO_AUTORIZADO();
  const id = Number(new URL(req.url).searchParams.get("c"));
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "Conversación inválida." }, { status: 400 });
  const c = await leerConversacion(await createClient(), perfil.id, id);
  if (!c) return Response.json({ error: "Esa conversación no existe." }, { status: 404 });
  return Response.json({ mensajes: c.mensajes }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const perfil = await autorizado();
  if (!perfil) return NO_AUTORIZADO();

  let cuerpo: z.infer<typeof Cuerpo>;
  try {
    cuerpo = Cuerpo.parse(await req.json());
  } catch {
    return Response.json({ error: `Escribe una pregunta (máximo ${MAX_PREGUNTA} caracteres).` }, { status: 400 });
  }

  // La sesión de quien pregunta: con ella corren las herramientas (la RLS sigue
  // siendo el último candado) y se leen sus conversaciones. service_role solo para
  // escribir en las tablas del agente, que no tienen permiso de escritura para nadie.
  const sesion = await createClient();
  const repo = repositorio(sesion, createAdminClient());
  const hoy = isoDia(hoyBogota());

  const cifrador = new TextEncoder();
  const flujo = new ReadableStream<Uint8Array>({
    async start(controller) {
      let abierto = true;
      const emitir = (l: LineaChat) => {
        if (!abierto) return;
        try {
          controller.enqueue(cifrador.encode(codificar(l)));
        } catch {
          abierto = false; // la persona cerró la pantalla
        }
      };
      try {
        await atenderPregunta(
          { pregunta: cuerpo.pregunta, conversacionId: cuerpo.conversacionId, perfilId: perfil.id },
          {
            repo,
            emitir,
            correr: ({ pregunta, historial, alEvento }) =>
              responder({ openai: clienteOpenAI(), ctx: { supabase: sesion, hoy }, pregunta, historial, alEvento }),
            registrar: ({ conversacionId, pregunta, r }) =>
              logAudit({
                action: "agente.consulta",
                entity: "agente_conversacion",
                entityId: String(conversacionId),
                after: {
                  pregunta,
                  consultas: r.herramientas.map((h) => h.nombre),
                  modelo: r.modelo,
                  costo_usd: Number(r.costoUsd.toFixed(4)),
                },
              }),
          },
        );
      } catch (e) {
        console.error("[agente] error en la ruta:", e instanceof Error ? e.message : e);
        emitir({ tipo: "error", mensaje: "No se pudo procesar la pregunta. Inténtalo de nuevo." });
      } finally {
        if (abierto) controller.close();
      }
    },
  });

  return new Response(flujo, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      // Que ningún intermediario guarde la respuesta para soltarla toda al final.
      "X-Accel-Buffering": "no",
    },
  });
}
