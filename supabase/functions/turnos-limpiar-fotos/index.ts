// ============================================================================
// Edge Function `turnos-limpiar-fotos` — borra las fotos de turno ya vencidas.
//
// La foto de una cara es dato sensible (Ley 1581) y el club decidió guardarlas
// 45 días. Se borra LA FOTO; el registro del turno se conserva siempre, porque
// es la prueba de nómina.
//
// La invoca pg_cron una vez al día (ver scripts/schedule-turnos-cron.mjs).
// Seguridad: requiere header `x-sync-secret` = secreto SYNC_SECRET del proyecto,
// igual que `siigo-sync`.
//
// ⚠️ EL ORDEN NO ES INTERCAMBIABLE: primero se borran los archivos y DESPUÉS se
// limpian las rutas en la base. Al revés, si el borrado fallara, esos archivos
// quedarían huérfanos para siempre porque nadie volvería a saber que existen.
// Así, si falla el último paso, la corrida de mañana los vuelve a ver, intenta
// borrarlos (ya no están, no pasa nada) y limpia las rutas: se arregla solo.
//
// Redeploy: node --env-file=.env scripts/deploy-turnos-fn.mjs
// ============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

// ⚠️ El plazo NO se escribe aquí a propósito: manda el valor por defecto de
// `turno_fotos_vencidas` (migración 0087) y esta tarea la llama sin parámetro,
// para que no exista un segundo número que se pueda desincronizar.
/** El API de Storage borra por lotes; se parte para no mandar una lista enorme. */
const LOTE = 100;

async function limpiar(): Promise<{ vencidas: number; borradas: number; olvidadas: number }> {
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await sb.rpc("turno_fotos_vencidas");
  if (error) throw new Error(`vencidas: ${error.message}`);

  const rutas = [...new Set((data ?? []).map((f: { ruta: string }) => f.ruta))];
  if (rutas.length === 0) return { vencidas: 0, borradas: 0, olvidadas: 0 };

  // 1) Los archivos.
  let borradas = 0;
  const olvidar: string[] = [];
  for (let i = 0; i < rutas.length; i += LOTE) {
    const lote = rutas.slice(i, i + LOTE);
    const { data: fuera, error: e } = await sb.storage.from("turnos").remove(lote);
    if (e) {
      // Se sigue con los demás lotes: lo que quede pendiente lo recoge la
      // corrida de mañana.
      console.error("remove:", e.message);
      continue;
    }
    borradas += fuera?.length ?? 0;
    // Se olvidan TODAS las del lote, no solo las que el API reportó: una que ya
    // no existía no vuelve en la respuesta y su ruta hay que limpiarla igual.
    olvidar.push(...lote);
  }

  // 2) Las rutas en la base, solo de lo que sí salió del almacenamiento.
  const { data: n, error: e2 } = await sb.rpc("turno_fotos_olvidar", { p_rutas: olvidar });
  if (e2) throw new Error(`olvidar: ${e2.message}`);

  return { vencidas: rutas.length, borradas, olvidadas: (n as number) ?? 0 };
}

Deno.serve(async (req) => {
  if (req.headers.get("x-sync-secret") !== Deno.env.get("SYNC_SECRET")) {
    return new Response("forbidden", { status: 403 });
  }
  try {
    const r = await limpiar();
    console.log("✅ turnos-limpiar-fotos", r);
    return new Response(JSON.stringify({ ok: true, ...r }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("❌ turnos-limpiar-fotos", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
