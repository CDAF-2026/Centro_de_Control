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

/** Espejo de normalizarNombre() (src/lib/registro/match.ts): minúsculas, sin tildes ni signos. */
function normalizar(s) {
  return (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/** Primer nombre + primer apellido, como claveNombre() de src/lib/clientes-match.ts. */
function claveNombre(nombres, apellidos) {
  const n = normalizar(nombres).split(" ")[0];
  const a = normalizar(apellidos).split(" ")[0];
  return n && a ? `${n} ${a}` : null;
}

/** Últimos 10 dígitos, como claveCelular() de src/lib/clientes-match.ts. */
function claveCelular(celular) {
  const d = (celular ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : null;
}

/** PostgREST corta en 1.000 filas sin avisar: se lee por lotes, y un error se lanza. */
async function leerTodo(tabla, campos) {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await s.from(tabla).select(campos).order("id").range(desde, desde + 999);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    filas.push(...(data ?? []));
    if ((data ?? []).length < 1000) return filas;
  }
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

  // Lo que la base ya conoce (no se toca). Espejo de leerBaseConocida() en
  // src/lib/clientes-match.ts: además del titular de cada ficha, los HIJOS
  // (`cliente_miembros`) y el correo de sus ACUDIENTES. Caso Maximiliano Pimienta
  // (7-oct-2026): la reserva traía el correo de la mamá y el documento del niño,
  // los dos ya en la base pero no en el titular, y se creó una ficha repetida.
  const existentes = await leerTodo("clientes", "id, email, documento, factura_a_nit, celular");
  const emailsBD = new Set(existentes.map((c) => (c.email ?? "").trim().toLowerCase()).filter(Boolean));
  // Los NIT de facturación adicionales también son de alguien (21-oct-2026).
  const extra = await leerTodo("cliente_facturacion_extra", "nit");
  const miembros = await leerTodo("cliente_miembros", "cliente_id, nombres, apellidos, documento");
  const docsBD = new Set(
    [...existentes.flatMap((c) => [c.documento, c.factura_a_nit]), ...extra.map((e) => e.nit), ...miembros.map((m) => m.documento)]
      .filter(Boolean)
      .map((d) => String(d).trim()),
  );
  const nombresPorFicha = new Map();
  for (const m of miembros) {
    const clave = claveNombre(m.nombres, m.apellidos);
    if (!clave) continue;
    if (!nombresPorFicha.has(m.cliente_id)) nombresPorFicha.set(m.cliente_id, new Set());
    nombresPorFicha.get(m.cliente_id).add(clave);
  }
  const agregar = (mapa, llave, clienteId) => {
    const nombres = nombresPorFicha.get(clienteId);
    if (!llave || !nombres) return;
    if (!mapa.has(llave)) mapa.set(llave, new Set());
    for (const n of nombres) mapa.get(llave).add(n);
  };
  const familias = new Map(); // correo de acudiente → nombres de los miembros de su ficha
  const familiasPorCelular = new Map(); // celular de la ficha o de un acudiente → ídem
  for (const a of await leerTodo("acudientes", "cliente_id, email, telefono")) {
    agregar(familias, (a.email ?? "").trim().toLowerCase() || null, a.cliente_id);
    agregar(familiasPorCelular, claveCelular(a.telefono), a.cliente_id);
  }
  for (const c of existentes) agregar(familiasPorCelular, claveCelular(c.celular), c.id);

  // Recolectar SOLO personas nuevas con correo.
  const vistos = new Set();
  const nuevos = [];
  let omitidosPorCedula = 0;
  let omitidosPorFamilia = 0;
  const enEstaCorrida = new Set();
  for (const b of reservas) {
    const email = (b.userEmail ?? "").trim().toLowerCase();
    if (!email || emailsBD.has(email) || vistos.has(email)) continue;

    const doc = documentoDeBooking(b);

    // DOBLE VALIDACIÓN: correo Y cédula. Antes, una persona que ya estaba en la
    // base con OTRO correo entraba como ficha nueva — y encima sin documento,
    // porque abajo `libre` daba false. Eso partió en dos a Karent Coronado
    // (15-sep-2026): EasyCancha traía `karentcoronadop@` y su ficha decía
    // `karentcoronado@`, una letra de diferencia, y la ficha nueva no tenía sus
    // paquetes. La cédula ya venía en la reserva y era la misma en las dos.
    if (doc && docsBD.has(doc.documento)) {
      omitidosPorCedula++;
      continue;
    }
    // Alguien de una familia que reserva con el correo o el celular de la mamá o el
    // papá (Maximiliano Velásquez: su propia cuenta, sin documento, celular del papá).
    const clave = claveNombre(b.userFirstName, b.userLastName);
    const cel = claveCelular(b.userPhone);
    if (clave && (familias.get(email)?.has(clave) || (cel && familiasPorCelular.get(cel)?.has(clave)))) {
      omitidosPorFamilia++;
      continue;
    }

    // La misma persona con dos cuentas en la misma corrida (Sofía Dávila: dos correos,
    // un celular) no puede salir como dos fichas nuevas. Espejo de claveColaSync().
    const enCola = clave && cel ? `${cel} ${clave}` : null;
    if (enCola && enEstaCorrida.has(enCola)) continue;
    if (enCola) enEstaCorrida.add(enCola);

    vistos.add(email);
    // El documento solo entra si es válido y no se lo está robando a otra ficha:
    // es la llave con la que se le atribuyen las facturas de Siigo.
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
    const { data: creados, error } = await s.from("clientes").insert(chunk).select("id");
    if (error || !creados) {
      console.error("  insert:", error?.message ?? "sin respuesta");
      continue;
    }
    insertados += creados.length;
    // La fila de titular de cada ficha la crea el trigger `clientes_crear_titular`
    // (migración 0066), no este script: era una de las cinco puertas por donde
    // se creaban fichas y solo tres la creaban.
  }

  const total = (await s.from("clientes").select("*", { count: "exact", head: true })).count;
  const conDoc = nuevos.filter((n) => n.documento).length;
  const notaCedula =
    (omitidosPorCedula > 0 ? ` ${omitidosPorCedula} se omitieron: ya estaban con otro correo (reconocidos por la cédula).` : "") +
    (omitidosPorFamilia > 0 ? ` ${omitidosPorFamilia} se omitieron: ya estaban en la ficha de su familia (mismo correo o celular).` : "");
  console.log(
    `✅ Sync clientes: +${insertados} nuevos (${MESES} meses), ${conDoc} con documento de EasyCancha. ` +
      `Total clientes: ${total}. Existentes intactos.${notaCedula}`,
  );
}

main().catch((e) => { console.error("❌", e.message); process.exit(1); });
