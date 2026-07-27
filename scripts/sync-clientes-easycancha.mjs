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
 * - Trae también documento, tipo de documento y fecha de nacimiento cuando
 *   EasyCancha los tiene, para que el cliente nazca ya emparejable con Siigo
 *   (documento = NIT). Para las fichas VIEJAS que quedaron sin cédula está
 *   `sync-documentos-easycancha.mjs`, que solo rellena vacíos.
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

/** Documento normalizado de una reserva, o null si el dato es basura (hay gente
 *  que escribió su correo en el campo). Espejo de documentoDeBooking() en
 *  src/lib/easycancha/client.ts y en sync-documentos-easycancha.mjs. */
function documentoDeBooking(b) {
  const crudo = (b.userFoidNumber ?? "").trim().replace(/[\s.\-]/g, "").toUpperCase();
  if (!crudo || !/\d/.test(crudo)) return null;
  const tipo = (b.userFoidType ?? "").toUpperCase() === "PP" ? "PP" : "CC";
  if (tipo === "CC" && !/^\d{5,11}$/.test(crudo)) return null;
  if (tipo === "PP" && !/^[A-Z0-9]{5,20}$/.test(crudo)) return null;
  return { documento: crudo, tipo };
}

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

  // Correos y documentos ya existentes en la base (no se tocan).
  const { data: existentes } = await s.from("clientes").select("email, documento, factura_a_nit");
  const emailsBD = new Set((existentes ?? []).map((c) => (c.email ?? "").toLowerCase()).filter(Boolean));
  const docsBD = new Set(
    (existentes ?? []).flatMap((c) => [c.documento, c.factura_a_nit]).filter(Boolean).map((d) => String(d).trim()),
  );

  // Recolectar SOLO personas nuevas con correo.
  const vistos = new Set();
  const nuevos = [];
  for (const b of reservas) {
    const email = (b.userEmail ?? "").trim().toLowerCase();
    if (!email || emailsBD.has(email) || vistos.has(email)) continue;
    vistos.add(email);

    // El documento solo entra si es válido y no se lo está robando a otra ficha:
    // es la llave con la que se le atribuyen las facturas de Siigo.
    const doc = documentoDeBooking(b);
    const libre = doc && !docsBD.has(doc.documento);
    if (libre) docsBD.add(doc.documento);

    nuevos.push({
      nombres: (b.userFirstName ?? "").trim() || "(sin nombre)",
      apellidos: (b.userLastName ?? "").trim() || "",
      email,
      celular: (b.userPhone ?? "").trim() || null,
      documento: libre ? doc.documento : null,
      tipo_documento: libre ? doc.tipo : null,
      fecha_nacimiento: (b.userBirthDate ?? "").trim() || null,
      // La base prohíbe es_menor sin acudiente; el marcador lo pone la ficha
      // cuando le registren el acudiente (la fecha de nacimiento ya queda ahí).
      es_menor: false,
    });
  }

  let insertados = 0;
  for (let i = 0; i < nuevos.length; i += 500) {
    const chunk = nuevos.slice(i, i + 500);
    const { data: creados, error } = await s
      .from("clientes")
      .insert(chunk)
      .select("id, nombres, apellidos, fecha_nacimiento, documento, tipo_documento, deportes");
    if (error || !creados) {
      console.error("  insert:", error?.message ?? "sin respuesta");
      continue;
    }
    insertados += creados.length;

    // Cada ficha necesita su fila de titular: la operación (asistencia, paquetes,
    // inscripciones) cuelga del miembro, no de la ficha.
    const { error: errTit } = await s.from("cliente_miembros").insert(
      creados.map((c) => ({
        cliente_id: c.id,
        nombres: c.nombres,
        apellidos: c.apellidos,
        fecha_nacimiento: c.fecha_nacimiento,
        documento: c.documento,
        tipo_documento: c.tipo_documento,
        deportes: c.deportes,
        es_titular: true,
      })),
    );
    if (errTit) console.error("  titular:", errTit.message);
  }

  const total = (await s.from("clientes").select("*", { count: "exact", head: true })).count;
  const conDoc = nuevos.filter((n) => n.documento).length;
  console.log(
    `✅ Sync clientes: +${insertados} nuevos (${MESES} meses), ${conDoc} con documento de EasyCancha. ` +
      `Total clientes: ${total}. Existentes intactos.`,
  );
}

main().catch((e) => { console.error("❌", e.message); process.exit(1); });
