/**
 * Sincroniza SOLO clientes nuevos desde EasyCancha. Seguro para correr seguido.
 * Uso: node --env-file=.env scripts/sync-clientes-easycancha.mjs [meses]   (default 3)
 *
 * - SOLO AGREGA clientes cuyo correo aún no existe en la base.
 * - NUNCA borra ni actualiza clientes existentes → conserva toda la edición manual
 *   (contacto de emergencia, cédula, fecha de nacimiento, etc.).
 * - NO toca profesores.
 * - Personas sin correo no se agregan automáticamente (se crearían al asignar su
 *   reserva, o manualmente), para no generar duplicados en cada corrida.
 */
import { createClient } from "@supabase/supabase-js";

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const EC_BASE = process.env.EASYCANCHA_API_URL ?? "https://www.easycancha.com/api";
const EC_TOKEN = process.env.EASYCANCHA_TOKEN;
const EC_CLUB = process.env.EASYCANCHA_CLUB_ID;
const MESES = Math.max(1, Math.min(6, Number(process.argv[2]) || 3));
const pad = (n) => String(n).padStart(2, "0");

async function ecBookings(from, to) {
  const url = `${EC_BASE}/clubs/${EC_CLUB}/bookingsReport?fromIsoDate=${from}&toIsoDate=${to}`;
  const r = await fetch(url, { headers: { apikey: EC_TOKEN, accept: "application/json" } });
  const j = await r.json();
  if (j.error || !Array.isArray(j.bookings)) throw new Error(`EasyCancha: ${j.msg || "error"}`);
  return j.bookings;
}

async function main() {
  if (!EC_TOKEN || !EC_CLUB) throw new Error("Faltan EASYCANCHA_TOKEN / EASYCANCHA_CLUB_ID en .env");

  // Traer reservas (mes a mes para no pasar el límite de 3 meses por consulta).
  const now = new Date();
  const reservas = [];
  for (let i = 0; i < MESES; i++) {
    const y = now.getFullYear(), m = now.getMonth() + i;
    const first = new Date(y, m, 1), last = new Date(y, m + 1, 0);
    const f = `${first.getFullYear()}-${pad(first.getMonth() + 1)}-01`;
    const t = `${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())}`;
    reservas.push(...(await ecBookings(f, t)));
  }

  // Correos ya existentes en la base (no se tocan).
  const { data: existentes } = await s.from("clientes").select("email");
  const emailsBD = new Set((existentes ?? []).map((c) => (c.email ?? "").toLowerCase()).filter(Boolean));

  // Recolectar SOLO personas nuevas con correo.
  const vistos = new Set();
  const nuevos = [];
  for (const b of reservas) {
    const email = (b.userEmail ?? "").trim().toLowerCase();
    if (!email || emailsBD.has(email) || vistos.has(email)) continue;
    vistos.add(email);
    nuevos.push({
      nombres: (b.userFirstName ?? "").trim() || "(sin nombre)",
      apellidos: (b.userLastName ?? "").trim() || "",
      email,
      celular: (b.userPhone ?? "").trim() || null,
      es_menor: false,
    });
  }

  let insertados = 0;
  for (let i = 0; i < nuevos.length; i += 500) {
    const chunk = nuevos.slice(i, i + 500);
    const { error } = await s.from("clientes").insert(chunk);
    if (error) console.error("  insert:", error.message);
    else insertados += chunk.length;
  }

  const total = (await s.from("clientes").select("*", { count: "exact", head: true })).count;
  console.log(`✅ Sync clientes: +${insertados} nuevos (${MESES} meses). Total clientes: ${total}. Existentes intactos.`);
}

main().catch((e) => { console.error("❌", e.message); process.exit(1); });
