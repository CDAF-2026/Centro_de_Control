/**
 * Trae el DOCUMENTO DE IDENTIDAD (y la fecha de nacimiento) que EasyCancha ya
 * tiene de cada persona y lo escribe en nuestra ficha de cliente.
 *
 * Uso:
 *   node --env-file=.env scripts/sync-documentos-easycancha.mjs            (simulacro, NO escribe)
 *   node --env-file=.env scripts/sync-documentos-easycancha.mjs --apply    (escribe)
 *   ... --meses 24                                                        (default 15)
 *
 * De dónde sale el dato: el bookingsReport de EasyCancha trae por reserva
 * `userFoidNumber` (número), `userFoidType` ("NI" cédula / "PP" pasaporte),
 * `userFoidCountry` y `userBirthDate`. El cruce con nuestra base es POR CORREO.
 *
 * Reglas de seguridad (este script toca la llave con la que se atribuye la plata):
 *  - NUNCA pisa un documento ya escrito. Si el nuestro difiere del de EasyCancha
 *    se REPORTA como conflicto y se deja intacto (puede haberlo corregido alguien
 *    a mano). Igual con la fecha de nacimiento.
 *  - NUNCA escribe un documento que ya sea de otro cliente (cédula o NIT de
 *    facturación): atribuiría las facturas de esa persona a la equivocada.
 *  - Descarta documentos basura (hay gente que escribió su correo en el campo).
 *  - Al enganchar facturas de Siigo solo toca las que NO tienen dueño y no están
 *    conciliadas a mano.
 */
import { writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const EC_BASE = process.env.EASYCANCHA_API_URL ?? "https://www.easycancha.com/api";
const EC_TOKEN = process.env.EASYCANCHA_TOKEN;
const EC_CLUB = process.env.EASYCANCHA_CLUB_ID;

const APPLY = process.argv.includes("--apply");
const MESES = Math.max(1, Math.min(36, Number(process.argv[process.argv.indexOf("--meses") + 1]) || 15));
const GENERIC_NITS = new Set(["222222222222"]); // mostrador anónimo de Siigo

const pad = (n) => String(n).padStart(2, "0");
const money = (n) => `$${Number(n || 0).toLocaleString("es-CO")}`;

/** Documento normalizado de una reserva, o null si el dato es basura.
 *  Espejo de documentoDeBooking() en src/lib/easycancha/client.ts. */
function documentoDeBooking(b) {
  const crudo = (b.userFoidNumber ?? "").trim().replace(/[\s.\-]/g, "").toUpperCase();
  if (!crudo || !/\d/.test(crudo)) return null; // sin dígitos = basura (correos escritos en el campo)
  const tipo = (b.userFoidType ?? "").toUpperCase() === "PP" ? "PP" : "CC";
  if (tipo === "CC" && !/^\d{5,11}$/.test(crudo)) return null;
  if (tipo === "PP" && !/^[A-Z0-9]{5,20}$/.test(crudo)) return null;
  return { documento: crudo, tipo };
}

/** Nombre en piezas comparables: sin acentos, en minúsculas, sin partículas. */
function piezasNombre(txt) {
  return (txt ?? "")
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase().replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((p) => p.length > 1 && !["de", "del", "la", "las", "los", "y"].includes(p));
}

/** Cuántas piezas del nombre comparten dos personas. */
function parecido(a, b) {
  const A = new Set(piezasNombre(a));
  return piezasNombre(b).filter((p) => A.has(p)).length;
}

/** ¿Los dos números parecen el MISMO documento mal escrito? (dedazo: falta o
 *  sobra un dígito, o uno está cambiado). Distinto de dos personas distintas. */
function mismoDocumentoConDedazo(a, b) {
  if (a === b) return true;
  const [corto, largo] = a.length <= b.length ? [a, b] : [b, a];
  if (largo.length - corto.length > 1) return false;
  if (largo.startsWith(corto) || largo.endsWith(corto)) return true; // dígito de más al final/inicio
  // distancia de edición ≤ 1
  let i = 0, j = 0, difs = 0;
  while (i < corto.length && j < largo.length) {
    if (corto[i] === largo[j]) { i++; j++; continue; }
    if (++difs > 1) return false;
    if (corto.length === largo.length) { i++; j++; } else { j++; }
  }
  return true;
}

/**
 * Un mismo correo puede pertenecer a VARIAS personas en EasyCancha: los papás
 * inscriben a los hijos con su propio correo (p. ej. los hermanos Álvarez bajo
 * kbmedallo@gmail.com, cada uno con su cédula). Elegir mal le atribuiría la
 * plata al hermano equivocado, así que se desempata por NOMBRE.
 *
 * Se devuelve null (→ revisar a mano) en dos casos:
 *  - el nombre no distingue con claridad a un candidato sobre otro;
 *  - los documentos en disputa son casi iguales, señal de que NO son dos
 *    personas sino la misma con dos cuentas y un dedazo en el número (ahí el
 *    nombre coincide con ambas y elegiría al azar).
 */
function elegirPersona(candidatos, nombreCliente) {
  const conDoc = candidatos.filter((p) => p.documento);
  const docs = [...new Set(conDoc.map((p) => p.documento))];
  if (docs.length <= 1) return { persona: conDoc[0] ?? candidatos[0] ?? null, ambiguo: false };

  // Misma persona con el documento mal escrito en una de sus cuentas.
  for (let i = 0; i < docs.length; i++)
    for (let j = i + 1; j < docs.length; j++)
      if (mismoDocumentoConDedazo(docs[i], docs[j]))
        return { persona: null, ambiguo: true, opciones: conDoc, motivo: "documentos casi iguales (dedazo)" };

  const puntajes = conDoc
    .map((p) => ({ p, n: parecido(nombreCliente, p.nombre) }))
    .sort((a, b) => b.n - a.n);
  const [mejor, segundo] = puntajes;
  if (mejor.n >= 1 && (!segundo || mejor.n > segundo.n)) return { persona: mejor.p, ambiguo: false };
  return { persona: null, ambiguo: true, opciones: conDoc, motivo: "el nombre no distingue" };
}

function edadDesde(fecha) {
  const n = new Date(`${fecha}T00:00:00`);
  if (Number.isNaN(n.getTime())) return null;
  const h = new Date();
  let e = h.getFullYear() - n.getFullYear();
  const m = h.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && h.getDate() < n.getDate())) e--;
  return e;
}

async function ecBookings(from, to) {
  const url = `${EC_BASE}/clubs/${EC_CLUB}/bookingsReport?fromIsoDate=${from}&toIsoDate=${to}`;
  const r = await fetch(url, { headers: { apikey: EC_TOKEN, accept: "application/json" } });
  const j = await r.json();
  if (j.error || !Array.isArray(j.bookings)) throw new Error(`EasyCancha: ${j.msg || "error"}`);
  return j.bookings;
}

/** Trae todas las filas de una tabla saltando el tope de 1000 de PostgREST. */
async function traerTodo(tabla, columnas, filtro = (q) => q) {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await filtro(s.from(tabla).select(columnas)).range(desde, desde + 999);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    filas.push(...data);
    if (data.length < 1000) break;
  }
  return filas;
}

async function main() {
  if (!EC_TOKEN || !EC_CLUB) throw new Error("Faltan EASYCANCHA_TOKEN / EASYCANCHA_CLUB_ID en .env");
  console.log(`• Leyendo ${MESES} meses de reservas de EasyCancha (club ${EC_CLUB})…`);

  // 1) Personas de EasyCancha por userId; luego se agrupan por correo. Un correo
  //    puede tener varias personas (padres que inscriben hijos con su correo).
  //    Se recorre mes a mes por el límite de 3 meses por consulta del reporte.
  const hoy = new Date();
  const porUserId = new Map();
  for (let i = MESES - 1; i >= -1; i--) {
    const ini = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    const fin = new Date(hoy.getFullYear(), hoy.getMonth() - i + 1, 0);
    const f = `${ini.getFullYear()}-${pad(ini.getMonth() + 1)}-01`;
    const t = `${fin.getFullYear()}-${pad(fin.getMonth() + 1)}-${pad(fin.getDate())}`;
    for (const b of await ecBookings(f, t)) {
      const email = (b.userEmail ?? "").trim().toLowerCase();
      if (!email || b.userId == null) continue;
      const p = porUserId.get(b.userId) ?? { userId: b.userId, email };
      p.nombre = `${b.userFirstName ?? ""} ${b.userLastName ?? ""}`.trim() || p.nombre;
      const doc = documentoDeBooking(b);
      if (doc) { p.documento = doc.documento; p.tipo = doc.tipo; }
      if (b.userBirthDate) p.nacimiento = b.userBirthDate;
      porUserId.set(b.userId, p);
    }
  }
  const porEmail = new Map();
  for (const p of porUserId.values()) porEmail.set(p.email, [...(porEmail.get(p.email) ?? []), p]);
  const conDoc = [...porUserId.values()].filter((p) => p.documento).length;
  const compartidos = [...porEmail.values()].filter((v) => v.length > 1).length;
  console.log(`  personas en EasyCancha: ${porUserId.size} (${conDoc} con documento válido)`);
  console.log(`  correos usados por más de una persona: ${compartidos}`);

  // 2) Nuestra base. Los documentos y NITs ya usados son zona prohibida.
  const clientes = await traerTodo(
    "clientes",
    "id, nombres, apellidos, email, documento, tipo_documento, fecha_nacimiento, es_menor, acudiente_id, factura_a_nit",
  );
  const ocupados = new Map(); // documento/NIT → cliente que ya lo tiene
  for (const c of clientes) {
    const d = (c.documento ?? "").trim();
    const n = (c.factura_a_nit ?? "").trim();
    if (d) ocupados.set(d, c);
    if (n && !ocupados.has(n)) ocupados.set(n, c);
  }
  console.log(`  clientes en la base: ${clientes.length} (${ocupados.size} documentos/NITs ya en uso)`);

  // 3) Decidir qué se escribe.
  const cambios = [];      // updates a aplicar
  const conflictos = [];   // documento distinto → NO se toca, se reporta
  const choques = [];      // el documento ya es de otro cliente → NO se toca
  const ambiguos = [];     // el correo lo comparten varias personas → NO se toca
  const menores = [];      // pasan a menor de edad y no tienen acudiente
  let yaCoincide = 0, sinDatoEnEC = 0, sinMatch = 0;

  for (const c of clientes) {
    const email = (c.email ?? "").trim().toLowerCase();
    const candidatos = email ? porEmail.get(email) : null;
    if (!candidatos?.length) { sinMatch++; continue; }

    const nombreCliente = `${c.nombres} ${c.apellidos}`.trim();
    const elegido = elegirPersona(candidatos, nombreCliente);
    if (elegido.ambiguo) {
      ambiguos.push({ c, opciones: elegido.opciones, motivo: elegido.motivo });
      continue;
    }
    const p = elegido.persona;
    if (!p) { sinMatch++; continue; }

    const nuestro = (c.documento ?? "").trim();
    const parche = {};

    if (p.documento) {
      if (!nuestro) {
        const duenio = ocupados.get(p.documento);
        if (duenio && duenio.id !== c.id) {
          choques.push({ c, doc: p.documento, duenio });
        } else {
          parche.documento = p.documento;
          parche.tipo_documento = p.tipo;
          ocupados.set(p.documento, c); // reservarlo dentro de esta misma corrida
        }
      } else if (nuestro === p.documento) {
        yaCoincide++;
        if (!c.tipo_documento) parche.tipo_documento = p.tipo; // completar solo el tipo
      } else {
        conflictos.push({ c, nuestro, ec: p.documento });
      }
    } else if (!nuestro) {
      sinDatoEnEC++;
    }

    if (p.nacimiento && !c.fecha_nacimiento) {
      const edad = edadDesde(p.nacimiento);
      if (edad != null && edad >= 0 && edad <= 100) {
        parche.fecha_nacimiento = p.nacimiento;
        const menor = edad < 18;
        if (menor !== c.es_menor) parche.es_menor = menor; // mantener coherente el marcador
        if (menor && !c.acudiente_id) menores.push({ c, nacimiento: p.nacimiento, edad });
      }
    }

    if (Object.keys(parche).length) cambios.push({ id: c.id, nombre: `${c.nombres} ${c.apellidos}`.trim(), parche });
  }

  const conDocNuevo = cambios.filter((x) => x.parche.documento);
  const conNacimiento = cambios.filter((x) => x.parche.fecha_nacimiento);

  console.log(`\n=== QUÉ SE VA A ESCRIBIR ===`);
  console.log(`  documentos nuevos:        ${conDocNuevo.length}`);
  console.log(`  fechas de nacimiento:     ${conNacimiento.length}`);
  console.log(`  solo tipo de documento:   ${cambios.length - conDocNuevo.length - conNacimiento.length + cambios.filter((x) => x.parche.documento && x.parche.fecha_nacimiento).length}`);
  console.log(`  clientes afectados:       ${cambios.length}`);
  console.log(`\n=== QUÉ NO SE TOCA ===`);
  console.log(`  ya coincidía:                          ${yaCoincide}`);
  console.log(`  ⚠ conflicto (documento distinto):      ${conflictos.length}`);
  console.log(`  ⚠ documento ya usado por otro cliente: ${choques.length}`);
  console.log(`  ⚠ correo compartido, no se pudo decidir: ${ambiguos.length}`);
  console.log(`  EasyCancha tampoco tiene documento:    ${sinDatoEnEC}`);
  console.log(`  sin correspondencia por correo:        ${sinMatch}`);

  if (conflictos.length) {
    console.log(`\n⚠ CONFLICTOS — revisar a mano en la ficha (no se tocaron):`);
    for (const x of conflictos) {
      console.log(`   #${x.c.id} ${x.c.nombres} ${x.c.apellidos} <${x.c.email}>`);
      console.log(`        nuestro: ${x.nuestro}   ·   EasyCancha: ${x.ec}`);
    }
  }
  if (choques.length) {
    console.log(`\n⚠ DOCUMENTO YA USADO POR OTRO CLIENTE (no se escribió):`);
    for (const x of choques) {
      console.log(`   #${x.c.id} ${x.c.nombres} ${x.c.apellidos} → ${x.doc} (ya es de #${x.duenio.id} ${x.duenio.nombres} ${x.duenio.apellidos})`);
    }
  }
  if (ambiguos.length) {
    console.log(`\n⚠ CORREO COMPARTIDO POR VARIAS PERSONAS — el nombre no alcanzó para decidir:`);
    for (const x of ambiguos) {
      console.log(`   #${x.c.id} ${x.c.nombres} ${x.c.apellidos} <${x.c.email}> — ${x.motivo}`);
      for (const o of x.opciones) console.log(`        candidato: ${o.nombre} → ${o.documento}`);
    }
  }
  if (menores.length) {
    console.log(`\n⚠ QUEDAN MARCADOS COMO MENOR DE EDAD Y NO TIENEN ACUDIENTE:`);
    for (const x of menores) {
      console.log(`   #${x.c.id} ${x.c.nombres} ${x.c.apellidos} — nació ${x.nacimiento} (${x.edad} años)`);
    }
    console.log(`   (la ficha pedirá el acudiente la próxima vez que se edite)`);
  }

  if (!APPLY) {
    console.log(`\n🔍 SIMULACRO — no se escribió nada. Para aplicar:`);
    console.log(`   node --env-file=.env scripts/sync-documentos-easycancha.mjs --apply\n`);
    await previsualizarSiigo(conDocNuevo);
    return;
  }

  // 4) Respaldo del estado anterior de las fichas que se van a tocar, por si hay
  //    que devolverse (se escribe la llave con la que se atribuyen las facturas).
  const previos = new Map(clientes.map((c) => [c.id, c]));
  const respaldo = `/tmp/cdaf-documentos-antes-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  await writeFile(
    respaldo,
    JSON.stringify(
      cambios.map((x) => {
        const c = previos.get(x.id);
        return {
          id: c.id, nombres: c.nombres, apellidos: c.apellidos,
          documento: c.documento, tipo_documento: c.tipo_documento,
          fecha_nacimiento: c.fecha_nacimiento, es_menor: c.es_menor,
        };
      }),
      null,
      2,
    ),
  );
  console.log(`\n💾 Respaldo del estado anterior: ${respaldo}`);

  // 5) Escribir, de a 25 en paralelo (cada fila lleva valores distintos).
  console.log(`• Escribiendo ${cambios.length} fichas…`);
  let ok = 0, sinMarcarMenor = 0;
  const fallos = [];

  /** La base prohíbe es_menor sin acudiente (cliente_menor_requiere_acudiente).
   *  Si choca, se guarda igual el documento y la fecha, y se deja el marcador
   *  como estaba: el dato real vale más que la bandera, y la ficha la recalcula
   *  cuando le pongan acudiente. */
  async function guardar(x) {
    const { error } = await s.from("clientes").update(x.parche).eq("id", x.id);
    if (!error) return { ok: true };
    if (x.parche.es_menor === true) {
      const { es_menor: _omitido, ...resto } = x.parche;
      if (Object.keys(resto).length) {
        const reintento = await s.from("clientes").update(resto).eq("id", x.id);
        if (!reintento.error) return { ok: true, sinMenor: true };
        return { ok: false, msg: reintento.error.message };
      }
    }
    return { ok: false, msg: error.message };
  }

  for (let i = 0; i < cambios.length; i += 25) {
    const lote = cambios.slice(i, i + 25);
    const res = await Promise.all(lote.map((x) => guardar(x).then((r) => ({ x, ...r }))));
    for (const r of res) {
      if (!r.ok) fallos.push(`#${r.x.id} ${r.x.nombre}: ${r.msg}`);
      else { ok++; if (r.sinMenor) sinMarcarMenor++; }
    }
  }
  console.log(`  actualizados: ${ok}${fallos.length ? ` · fallos: ${fallos.length}` : ""}`);
  if (sinMarcarMenor) {
    console.log(`  (${sinMarcarMenor} menores guardaron documento y fecha, pero NO quedaron marcados`);
    console.log(`   como menor porque la base exige acudiente — ver la lista de arriba)`);
  }
  fallos.slice(0, 10).forEach((f) => console.log(`   ✗ ${f}`));

  await engancharSiigo(conDocNuevo);
}

/** Facturas de Siigo que quedarían enganchadas (solo informa). */
async function previsualizarSiigo(nuevos) {
  const { libres, porCliente } = await facturasEnganchables(nuevos);
  if (!libres.length) return;
  const total = libres.reduce((a, f) => a + Number(f.total || 0), 0);
  const saldo = libres.reduce((a, f) => a + Number(f.saldo || 0), 0);
  console.log(`📎 Con esos documentos se engancharían ${libres.length} facturas de Siigo hoy sin dueño:`);
  console.log(`   facturado ${money(total)} · deuda ${money(saldo)} · ${porCliente.size} clientes\n`);
}

/** Ata a su cliente las facturas de Siigo que empatan por documento.
 *  Solo las que no tienen dueño y no fueron conciliadas a mano. */
async function engancharSiigo(nuevos) {
  const { libres, porCliente } = await facturasEnganchables(nuevos);
  if (!libres.length) {
    console.log(`\n📎 Ninguna factura de Siigo quedó pendiente de enganchar.`);
    return;
  }
  console.log(`\n• Enganchando ${libres.length} facturas de Siigo a su cliente…`);
  let atadas = 0;
  for (const [clienteId, ids] of porCliente) {
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await s
        .from("siigo_facturas")
        .update({ cliente_id: clienteId, estado_conciliacion: "auto" })
        .in("id", ids.slice(i, i + 200));
      if (error) console.log(`   ✗ cliente ${clienteId}: ${error.message}`);
      else atadas += ids.slice(i, i + 200).length;
    }
  }
  const total = libres.reduce((a, f) => a + Number(f.total || 0), 0);
  const saldo = libres.reduce((a, f) => a + Number(f.saldo || 0), 0);
  console.log(`  facturas enganchadas: ${atadas} · facturado ${money(total)} · deuda ${money(saldo)} · ${porCliente.size} clientes`);
}

async function facturasEnganchables(nuevos) {
  const porDoc = new Map(nuevos.map((x) => [x.parche.documento, x.id]));
  if (!porDoc.size) return { libres: [], porCliente: new Map() };

  const pendientes = await traerTodo(
    "siigo_facturas",
    "id, cliente_identificacion, total, saldo, estado_conciliacion",
    (q) => q.is("cliente_id", null).neq("estado_conciliacion", "conciliada"),
  );
  const libres = pendientes.filter((f) => {
    const ident = (f.cliente_identificacion ?? "").trim();
    return ident && !GENERIC_NITS.has(ident) && porDoc.has(ident);
  });
  const porCliente = new Map();
  for (const f of libres) {
    const cid = porDoc.get((f.cliente_identificacion ?? "").trim());
    porCliente.set(cid, [...(porCliente.get(cid) ?? []), f.id]);
  }
  return { libres, porCliente };
}

main().catch((e) => { console.error("❌", e.message); process.exit(1); });
