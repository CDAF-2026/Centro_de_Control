/**
 * Importa profesores y clientes REALES desde EasyCancha y borra los datos demo.
 * Uso: node --env-file=.env scripts/import-easycancha.mjs [meses]
 *   meses = cuántos meses (desde el mes actual) traer de EasyCancha (default 3).
 *
 * - BORRA clientes demo (+ dependientes) y profesores demo (+demo.profe*).
 *   CONSERVA el superadmin y las cuentas demo de coordinación/recepción.
 * - Crea profesores (correo placeholder + valor $90.000/h) y clientes (todas las
 *   reservas, dedupe por correo) tal cual vienen, con los campos faltantes en blanco.
 */
import { createClient } from "@supabase/supabase-js";

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const EC_BASE = process.env.EASYCANCHA_API_URL ?? "https://www.easycancha.com/api";
const EC_TOKEN = process.env.EASYCANCHA_TOKEN;
const EC_CLUB = process.env.EASYCANCHA_CLUB_ID;
const PROFE_PW = "CdafProfe.2026";
const VALOR_HORA = 90000;
const MESES = Math.max(1, Math.min(6, Number(process.argv[2]) || 3));

const pad = (n) => String(n).padStart(2, "0");
const slug = (str) =>
  (str || "")
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "").replace(/\.{2,}/g, ".");

function profesorDeCancha(courtName) {
  if (!courtName) return null;
  if (!/(profesor|entrenador|profe)/i.test(courtName)) return null;
  const r = courtName.replace(/[\s\-–—]*cancha\s*\d+.*$/i, "").replace(/[\s\-–—]+$/, "").trim();
  return r || courtName.trim();
}

async function ecBookings(from, to) {
  const url = `${EC_BASE}/clubs/${EC_CLUB}/bookingsReport?fromIsoDate=${from}&toIsoDate=${to}`;
  const r = await fetch(url, { headers: { apikey: EC_TOKEN, accept: "application/json" } });
  const j = await r.json();
  if (j.error || !Array.isArray(j.bookings)) throw new Error(`EasyCancha: ${j.msg || "error"}`);
  return j.bookings;
}

/** Trae N meses, mes a mes (evita el límite de 3 meses por consulta). */
async function traerReservas() {
  const now = new Date();
  const all = [];
  for (let i = 0; i < MESES; i++) {
    const y = now.getFullYear(), m = now.getMonth() + i;
    const first = new Date(y, m, 1), last = new Date(y, m + 1, 0);
    const f = `${first.getFullYear()}-${pad(first.getMonth() + 1)}-01`;
    const t = `${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())}`;
    const bk = await ecBookings(f, t);
    console.log(`   ${f} → ${t}: ${bk.length} reservas`);
    all.push(...bk);
  }
  // dedupe por id de reserva
  const map = new Map();
  for (const b of all) map.set(b.id, b);
  return [...map.values()];
}

async function delByIds(table) {
  const { data } = await s.from(table).select("id");
  const ids = (data ?? []).map((r) => r.id);
  if (!ids.length) return 0;
  const { error } = await s.from(table).delete().in("id", ids);
  if (error) console.error(`  del ${table}:`, error.message);
  return ids.length;
}

async function borrarDemo() {
  console.log("• Borrando datos demo (clientes + profesores)…");
  // Dependientes de clientes primero, luego clientes y acudientes.
  for (const t of ["asignaciones_pago", "abonos", "paquetes_cliente", "cliente_documentos", "inscripciones"]) {
    const n = await delByIds(t);
    if (n) console.log(`   ${t}: ${n} borrados`);
  }
  const cli = await delByIds("clientes");
  const acu = await delByIds("acudientes");
  console.log(`   clientes: ${cli} · acudientes: ${acu}`);

  // Profesores demo: cuentas auth con "+demo.profe", sus valores y perfiles.
  const { data: users } = await s.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const demoProfes = (users?.users ?? []).filter((u) => u.email?.includes("+demo.profe"));
  for (const u of demoProfes) {
    await s.from("profesor_valor_clase").delete().eq("profesor_id", u.id);
    await s.auth.admin.deleteUser(u.id); // cascada a profiles
  }
  console.log(`   profesores demo borrados: ${demoProfes.length}`);
}

async function importarProfesores(reservas) {
  console.log("• Importando profesores de EasyCancha…");
  const { data: sa } = await s.from("profiles").select("id").eq("role", "superadmin").limit(1).single();
  const saId = sa?.id ?? null;

  const nombres = [...new Set(reservas.map((b) => profesorDeCancha(b.courtName)).filter(Boolean))].sort();
  const { data: existentes } = await s.from("profiles").select("id, nombre").eq("role", "profesor");
  const yaExiste = new Map((existentes ?? []).map((p) => [p.nombre, p.id]));

  let creados = 0;
  for (const nombre of nombres) {
    if (yaExiste.has(nombre)) continue;
    const email = `vena.digital.2207+profe.${slug(nombre)}@gmail.com`;
    let { data: created, error } = await s.auth.admin.createUser({
      email, password: PROFE_PW, email_confirm: true, user_metadata: { nombre },
    });
    let uid = created?.user?.id ?? null;
    if (error) {
      if (/registered|exists/i.test(error.message)) {
        const { data: us } = await s.auth.admin.listUsers({ page: 1, perPage: 1000 });
        uid = us?.users?.find((u) => u.email === email)?.id ?? null;
      } else { console.error(`  profe ${nombre}:`, error.message); continue; }
    }
    if (!uid) continue;
    await s.from("profiles").update({ role: "profesor", nombre }).eq("id", uid);
    await s.from("profesor_valor_clase").insert({ profesor_id: uid, valor: VALOR_HORA, created_by: saId });
    creados++;
  }
  console.log(`   profesores creados: ${creados} (de ${nombres.length} detectados; valor $${VALOR_HORA}/h)`);
}

async function importarClientes(reservas) {
  console.log("• Importando clientes de EasyCancha (todas las reservas)…");
  const { data: existentes } = await s.from("clientes").select("email");
  const emailsBD = new Set((existentes ?? []).map((c) => (c.email ?? "").toLowerCase()).filter(Boolean));

  const vistos = new Set();
  const filas = [];
  for (const b of reservas) {
    const email = (b.userEmail ?? "").trim().toLowerCase();
    const nombres = (b.userFirstName ?? "").trim();
    const apellidos = (b.userLastName ?? "").trim();
    if (!nombres && !apellidos && !email) continue;
    const key = email || `${nombres}|${apellidos}|${b.userPhone ?? ""}`.toLowerCase();
    if (vistos.has(key)) continue;
    if (email && emailsBD.has(email)) continue; // ya existe en BD
    vistos.add(key);
    filas.push({
      nombres: nombres || "(sin nombre)",
      apellidos: apellidos || "",
      email: email || null,
      celular: (b.userPhone ?? "").trim() || null,
      es_menor: false,
    });
  }

  let insertados = 0;
  for (let i = 0; i < filas.length; i += 500) {
    const chunk = filas.slice(i, i + 500);
    const { error } = await s.from("clientes").insert(chunk);
    if (error) console.error("  clientes chunk:", error.message);
    else insertados += chunk.length;
  }
  console.log(`   clientes creados: ${insertados} (${filas.filter((f) => !f.email).length} sin correo)`);
}

async function main() {
  if (!EC_TOKEN || !EC_CLUB) throw new Error("Faltan EASYCANCHA_TOKEN / EASYCANCHA_CLUB_ID en .env");
  console.log(`• Trayendo ${MESES} mes(es) de reservas de EasyCancha (club ${EC_CLUB})…`);
  const reservas = await traerReservas();
  console.log(`   total reservas únicas: ${reservas.length}`);

  await borrarDemo();
  await importarProfesores(reservas);
  await importarClientes(reservas);

  const cnt = async (t) => (await s.from(t).select("*", { count: "exact", head: true })).count;
  console.log("\n✅ Import EasyCancha listo:");
  console.log("   profiles:", await cnt("profiles"), "(incluye SA + coord/recep) · clientes:", await cnt("clientes"));
  console.log("   contraseña temporal de profesores:", PROFE_PW, "(correos vena.digital.2207+profe.<nombre>@gmail.com)");
}

main().catch((e) => { console.error("❌", e.message); process.exit(1); });
