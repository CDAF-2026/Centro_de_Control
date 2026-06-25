/**
 * Sincroniza facturas de Siigo a la plataforma. Seguro para correr seguido (upsert por siigo_id).
 * Uso: node --env-file=.env scripts/sync-siigo.mjs [--from=YYYY-MM-DD] [--full]
 *
 * - Trae facturas desde el cursor (siigo_sync.last_cursor) o 2026-06-01 por defecto.
 *   --from=fecha fuerza el inicio; --full reimporta desde 2026-06-01.
 * - Desglosa cada factura por línea y categoriza por el account_group del producto → servicio.
 * - Estado de conciliación: cliente real emparejado por documento → auto; sin dueño con saldo →
 *   pendiente; pagada sin dueño → mostrador.
 */
import { createClient } from "@supabase/supabase-js";

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const SIIGO_USER = process.env.SIIGO_USERNAME;
const SIIGO_KEY = process.env.SIIGO_ACCESS_KEY;
const PARTNER_ID = "CentroDeControlCDAF";
const SIIGO = "https://api.siigo.com";
const DEFAULT_FROM = "2026-06-01";
const GENERIC_NITS = new Set(["222222222222"]);

const args = process.argv.slice(2);
const fromArg = (args.find((a) => a.startsWith("--from=")) || "").split("=")[1];
const full = args.includes("--full");
const todayIso = new Date().toISOString().slice(0, 10);

let token = null;
async function auth() {
  const r = await fetch(`${SIIGO}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Partner-Id": PARTNER_ID },
    body: JSON.stringify({ username: SIIGO_USER, access_key: SIIGO_KEY }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("Siigo auth falló: " + JSON.stringify(j).slice(0, 200));
  token = j.access_token;
}
async function sg(path) {
  const r = await fetch(SIIGO + path, { headers: { Authorization: `Bearer ${token}`, "Partner-Id": PARTNER_ID } });
  if (r.status === 401) { await auth(); return sg(path); }
  if (!r.ok) throw new Error(`Siigo ${path}: HTTP ${r.status} ${(await r.text()).slice(0, 150)}`);
  return r.json();
}

async function main() {
  if (!SIIGO_USER || !SIIGO_KEY) throw new Error("Faltan SIIGO_USERNAME / SIIGO_ACCESS_KEY en .env");
  await auth();

  // 1) Mapa grupo de Siigo → servicio.
  const { data: servicios } = await s.from("servicios").select("id, siigo_grupo");
  const servicioByGrupo = new Map();
  for (const sv of servicios ?? []) if (sv.siigo_grupo) servicioByGrupo.set(sv.siigo_grupo.trim().toLowerCase(), sv.id);
  const servicioDeGrupo = (g) => (g ? servicioByGrupo.get(String(g).trim().toLowerCase()) ?? null : null);

  // 2) Catálogo de productos (code → servicio) + refresco de caché.
  console.log("• Productos…");
  const prodByCode = new Map();
  for (let page = 1; ; page++) {
    const r = await sg(`/v1/products?page=${page}&page_size=100`);
    const results = r.results ?? [];
    for (const p of results) {
      const grupo = p.account_group?.name ?? null;
      prodByCode.set(p.code, { nombre: p.name, account_group: grupo, servicio_id: servicioDeGrupo(grupo) });
    }
    if (results.length < 100) break;
  }
  const prodRows = [...prodByCode.entries()].map(([codigo, v]) => ({
    codigo, nombre: v.nombre, account_group: v.account_group, servicio_id: v.servicio_id, updated_at: new Date().toISOString(),
  }));
  for (let i = 0; i < prodRows.length; i += 500) await s.from("siigo_productos").upsert(prodRows.slice(i, i + 500), { onConflict: "codigo" });
  console.log("  productos en caché:", prodRows.length);

  // 3) Clientes (documento → id) para auto-match.
  const cliByDoc = new Map();
  {
    const { data: clientes } = await s.from("clientes").select("id, documento");
    for (const c of clientes ?? []) if (c.documento) cliByDoc.set(String(c.documento).trim(), c.id);
  }

  // 4) Cursor de fecha.
  let desde = DEFAULT_FROM;
  if (fromArg) desde = fromArg;
  else if (!full) {
    const { data: sync } = await s.from("siigo_sync").select("last_cursor").eq("id", 1).maybeSingle();
    if (sync?.last_cursor) desde = sync.last_cursor;
  }
  console.log(`• Facturas ${desde} → ${todayIso}…`);

  // 5) Traer y procesar paginado (por lotes de una página para minimizar round trips).
  let totalFac = 0, conSaldo = 0, auto = 0, pendiente = 0, mostrador = 0, conciliada = 0;
  for (let page = 1; ; page++) {
    const r = await sg(`/v1/invoices?date_start=${desde}&date_end=${todayIso}&page=${page}&page_size=100`);
    const results = r.results ?? [];
    if (!results.length) break;

    // Las ya conciliadas a mano se preservan: solo se les refresca total/saldo.
    const batchIds = results.map((f) => f.id);
    const { data: prev } = await s.from("siigo_facturas").select("siigo_id, estado_conciliacion").in("siigo_id", batchIds);
    const locked = new Set((prev ?? []).filter((x) => x.estado_conciliacion === "conciliada").map((x) => x.siigo_id));

    const normalRows = [];
    const lockedRows = [];
    for (const f of results) {
      const ident = f.customer?.identification ? String(f.customer.identification).trim() : null;
      const saldo = Math.round(f.balance ?? 0);
      const total = Math.round(f.total ?? 0);
      if (saldo > 0) conSaldo++;
      if (locked.has(f.id)) { lockedRows.push({ siigo_id: f.id, total, saldo }); conciliada++; continue; }
      let clienteId = null;
      if (ident && !GENERIC_NITS.has(ident)) clienteId = cliByDoc.get(ident) ?? null;
      let estado;
      if (clienteId) { estado = "auto"; auto++; }
      else if (saldo > 0) { estado = "pendiente"; pendiente++; }
      else { estado = "mostrador"; mostrador++; }
      normalRows.push({ siigo_id: f.id, numero: f.name, fecha: f.date, cliente_identificacion: ident, cliente_id: clienteId, total, saldo, estado_conciliacion: estado });
    }

    if (lockedRows.length) await s.from("siigo_facturas").upsert(lockedRows, { onConflict: "siigo_id" });

    let idBySiigo = new Map();
    if (normalRows.length) {
      const { data: facs, error: facErr } = await s
        .from("siigo_facturas")
        .upsert(normalRows, { onConflict: "siigo_id" })
        .select("id, siigo_id");
      if (facErr) throw new Error("upsert facturas: " + facErr.message);
      idBySiigo = new Map((facs ?? []).map((x) => [x.siigo_id, x.id]));
    }

    // Reemplazar líneas SOLO de las no conciliadas (preserva correcciones manuales de categoría).
    const facIds = [...idBySiigo.values()];
    if (facIds.length) await s.from("siigo_factura_lineas").delete().in("factura_id", facIds);
    const allLines = [];
    for (const f of results) {
      const facId = idBySiigo.get(f.id);
      if (!facId) continue;
      for (const it of f.items ?? []) {
        allLines.push({
          factura_id: facId, codigo: it.code ?? null, descripcion: it.description ?? null,
          servicio_id: it.code ? prodByCode.get(it.code)?.servicio_id ?? null : null,
          monto: Math.round(it.total ?? 0), cantidad: it.quantity ?? 1,
        });
      }
    }
    for (let i = 0; i < allLines.length; i += 500) await s.from("siigo_factura_lineas").insert(allLines.slice(i, i + 500));
    totalFac += results.length;
    process.stdout.write(`  página ${page}: ${totalFac} facturas\r`);
    if (results.length < 100) break;
  }
  console.log("");

  // 6) Guardar cursor.
  await s.from("siigo_sync").upsert({ id: 1, last_cursor: todayIso, updated_at: new Date().toISOString() }, { onConflict: "id" });

  console.log(`\n✅ Siigo sync: ${totalFac} facturas | auto ${auto} · pendiente ${pendiente} · mostrador ${mostrador} · conciliada ${conciliada} | con saldo ${conSaldo}`);
}
main().catch((e) => { console.error("❌", e.message); process.exit(1); });
