// ============================================================================
// Edge Function `siigo-sync` — sincronización automática de facturas Siigo.
// La invoca pg_cron (ver migración 0024 + scripts/schedule-siigo-cron.mjs):
//   - cada 20 min con {"mode":"incremental"}  → trae desde el cursor.
//   - cada noche con  {"mode":"refresh"}      → re-trae desde 2026-06-01 y
//     refresca saldos/estados de facturas viejas (deudas que se pagan después).
// Seguridad: requiere header `x-sync-secret` = secreto SYNC_SECRET del proyecto.
// Misma lógica que scripts/sync-siigo.mjs (CLI); mantener ambos en sintonía.
// Redeploy: node --env-file=.env scripts/deploy-siigo-fn.mjs
// ============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const SIIGO = "https://api.siigo.com";
const PARTNER_ID = "CentroDeControlCDAF";
const DEFAULT_FROM = "2026-06-01";
const GENERIC = /^(\d)\1+$/;
/** Tope de facturas abiertas a repasar por corrida (guarda por si la cartera crece mucho). */
const MAX_ABIERTAS = 400;

let token: string | null = null;

async function auth(): Promise<void> {
  const r = await fetch(`${SIIGO}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Partner-Id": PARTNER_ID },
    body: JSON.stringify({
      username: Deno.env.get("SIIGO_USERNAME"),
      access_key: Deno.env.get("SIIGO_ACCESS_KEY"),
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("Siigo auth falló: " + JSON.stringify(j).slice(0, 200));
  token = j.access_token;
}

// deno-lint-ignore no-explicit-any
async function sg(path: string): Promise<any> {
  const r = await fetch(SIIGO + path, {
    headers: { Authorization: `Bearer ${token}`, "Partner-Id": PARTNER_ID },
  });
  if (r.status === 401) {
    await auth();
    return sg(path);
  }
  if (!r.ok) throw new Error(`Siigo ${path}: HTTP ${r.status} ${(await r.text()).slice(0, 150)}`);
  return r.json();
}

/**
 * Repaso de facturas con saldo abierto. Una deuda vieja que se paga HOY no entra por el
 * rango de fechas (la factura conserva su fecha original), así que el sync incremental
 * nunca se enteraba y había que esperar al refresh nocturno. Se consultan una a una por
 * id —son decenas— y solo se escriben las que cambiaron. Toca ÚNICAMENTE total/saldo:
 * nunca el estado de conciliación (respeta las conciliadas a mano).
 */
// deno-lint-ignore no-explicit-any
async function repasarAbiertas(s: any): Promise<number> {
  const { data } = await s
    .from("siigo_facturas")
    .select("siigo_id, total, saldo")
    .gt("saldo", 0)
    .limit(MAX_ABIERTAS);
  const abiertas = data ?? [];
  if (!abiertas.length) return 0;

  const cambios: { siigo_id: string; total: number; saldo: number }[] = [];
  for (let i = 0; i < abiertas.length; i += 5) {
    const res = await Promise.all(
      // deno-lint-ignore no-explicit-any
      abiertas.slice(i, i + 5).map(async (row: any) => {
        try {
          const f = await sg(`/v1/invoices/${row.siigo_id}`);
          const total = Math.round(f.total ?? 0);
          const saldo = Math.round(f.balance ?? 0);
          if (total === row.total && saldo === row.saldo) return null;
          return { siigo_id: row.siigo_id, total, saldo };
        } catch {
          return null; // una factura borrada/inaccesible no debe tumbar el sync
        }
      }),
    );
    for (const r of res) if (r) cambios.push(r);
  }
  // OJO: aquí NO sirve upsert parcial. PostgREST manda un INSERT ... ON CONFLICT y la fila
  // propuesta viola el NOT NULL de `fecha`, así que falla en silencio. Va update por fila.
  let escritas = 0;
  for (const c of cambios) {
    const { error } = await s
      .from("siigo_facturas")
      .update({ total: c.total, saldo: c.saldo })
      .eq("siigo_id", c.siigo_id);
    if (error) throw new Error(`actualizar saldo ${c.siigo_id}: ${error.message}`);
    escritas++;
  }
  return escritas;
}

/** Tope para pedir notas crédito: `created_end` es EXCLUSIVO, así que va mañana para incluir hoy. */
const ncHasta = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10);

/**
 * Notas crédito: anulan (total o parcialmente) facturas ya importadas. Siigo deja saldo=0 al
 * anular, así que sin esto una anulada se contaría como "pagada". Se revisa SIEMPRE desde el
 * inicio: una NC puede anular una factura vieja, fuera del rango incremental.
 */
// deno-lint-ignore no-explicit-any
async function reconciliarNotasCredito(s: any): Promise<number> {
  const ncPorFactura = new Map<string, { monto: number; numeros: string[] }>();
  for (let page = 1; ; page++) {
    // OJO con `created_end`: es EXCLUSIVO del día indicado. Con created_end=hoy las notas
    // crédito hechas HOY quedaban fuera y la factura anulada se contaba como cobrada
    // (verificado 2026-07-23 con NC-1-644 sobre FV-2-5555). Por eso se pide hasta mañana.
    const r = await sg(`/v1/credit-notes?created_start=${DEFAULT_FROM}&created_end=${ncHasta()}&page=${page}&page_size=100`);
    const results = r.results ?? [];
    for (const n of results) {
      const ref = n.invoice?.id;
      if (!ref) continue;
      const cur = ncPorFactura.get(ref) ?? { monto: 0, numeros: [] };
      cur.monto += Math.round(n.total ?? 0);
      cur.numeros.push(n.name);
      ncPorFactura.set(ref, cur);
    }
    if (results.length < 100) break;
  }
  const payload = [...ncPorFactura.entries()].map(([siigo_id, v]) => ({
    siigo_id, monto: v.monto, numeros: v.numeros.join(", "),
  }));
  const { error } = await s.rpc("siigo_set_notas_credito", { p: payload });
  if (error) throw new Error("notas crédito: " + error.message);
  return payload.length;
}

async function runSync(mode: "incremental" | "refresh"): Promise<string> {
  const s = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const todayIso = new Date().toISOString().slice(0, 10);

  let desde = DEFAULT_FROM;
  if (mode === "incremental") {
    const { data: sync } = await s.from("siigo_sync").select("last_cursor").eq("id", 1).maybeSingle();
    if (sync?.last_cursor) desde = sync.last_cursor;
  }

  await auth();

  // 1) Facturas del rango PRIMERO: si no hay nada, salir barato (sin productos/clientes).
  // deno-lint-ignore no-explicit-any
  const facturas: any[] = [];
  for (let page = 1; ; page++) {
    const r = await sg(`/v1/invoices?date_start=${desde}&date_end=${todayIso}&page=${page}&page_size=100`);
    const results = r.results ?? [];
    facturas.push(...results);
    if (results.length < 100) break;
  }
  const touch = () =>
    s.from("siigo_sync").upsert(
      { id: 1, last_cursor: todayIso, updated_at: new Date().toISOString() },
      { onConflict: "id" },
    );
  // 1b) Repaso de deudas viejas que se pagaron. Va ANTES de la salida temprana: los días
  //     en que Siigo aún no cargó facturación (rezago de ~1 día) igual hay que refrescar
  //     los saldos abiertos. En modo refresh es redundante: ahí se re-lee todo el rango.
  const abiertasAct = mode === "incremental" ? await repasarAbiertas(s) : 0;

  if (facturas.length === 0) {
    // Las notas crédito se reconcilian IGUAL: con el rezago de ~1 día de Siigo, "sin facturas
    // nuevas" es el caso de todas las mañanas, y si se saltara, una factura anulada hoy
    // quedaría con saldo 0 y sin nota crédito → contaría como ingreso cobrado.
    const ncAnuladas = await reconciliarNotasCredito(s);
    await touch();
    return `sin facturas nuevas (${desde} → ${todayIso}) · saldos actualizados ${abiertasAct} · ${ncAnuladas} anuladas por NC`;
  }

  // 2) Grupo de Siigo → servicio del catálogo.
  const { data: servicios } = await s.from("servicios").select("id, siigo_grupo, siigo_codigos");
  const servicioByGrupo = new Map<string, number>();
  const servicioByCodigo = new Map<string, number>();
  for (const sv of servicios ?? []) {
    if (sv.siigo_grupo) servicioByGrupo.set(sv.siigo_grupo.trim().toLowerCase(), sv.id);
    for (const c of (sv.siigo_codigos ?? []) as string[]) servicioByCodigo.set(String(c).trim().toUpperCase(), sv.id);
  }
  const servicioDeGrupo = (g: string | null) => (g ? servicioByGrupo.get(g.trim().toLowerCase()) ?? null : null);
  // El CÓDIGO le gana al GRUPO: matrícula y mensualidad comparten grupo en Siigo, así que
  // el grupo solo no alcanza para separarlas (migración 0072). Es la excepción, no la regla.
  const servicioDeProducto = (codigo: string | null, grupo: string | null) =>
    (codigo ? servicioByCodigo.get(String(codigo).trim().toUpperCase()) ?? null : null) ?? servicioDeGrupo(grupo);

  // 3) Productos (code → servicio) + refresco de caché.
  const prodByCode = new Map<string, { nombre: string; account_group: string | null; servicio_id: number | null }>();
  for (let page = 1; ; page++) {
    const r = await sg(`/v1/products?page=${page}&page_size=100`);
    const results = r.results ?? [];
    for (const p of results) {
      const grupo = p.account_group?.name ?? null;
      prodByCode.set(p.code, { nombre: p.name, account_group: grupo, servicio_id: servicioDeProducto(p.code, grupo) });
    }
    if (results.length < 100) break;
  }
  const nowIso = new Date().toISOString();
  const prodRows = [...prodByCode.entries()].map(([codigo, v]) => ({
    codigo, nombre: v.nombre, account_group: v.account_group, servicio_id: v.servicio_id, updated_at: nowIso,
  }));
  for (let i = 0; i < prodRows.length; i += 500) {
    await s.from("siigo_productos").upsert(prodRows.slice(i, i + 500), { onConflict: "codigo" });
  }

  // 4) Clientes de Siigo (NIT → nombre) y nuestros clientes (documento → id).
  const nombrePorNit = new Map<string, string>();
  for (let page = 1; ; page++) {
    const r = await sg(`/v1/customers?page=${page}&page_size=100`);
    const results = r.results ?? [];
    for (const c of results) {
      const nom = Array.isArray(c.name) ? c.name.filter(Boolean).join(" ") : c.name ?? "";
      if (c.identification) nombrePorNit.set(String(c.identification).trim(), String(nom).trim());
    }
    if (results.length < 100) break;
  }
  const cliByDoc = new Map<string, number>();
  // NIT de facturación: un cliente puede recibir facturas bajo otro NIT (empresa/familiar).
  const cliByFactNit = new Map<string, number>();
  {
    const { data: clientes } = await s.from("clientes").select("id, documento, factura_a_nit");
    for (const c of clientes ?? []) {
      if (c.documento) cliByDoc.set(String(c.documento).trim(), c.id);
      if (c.factura_a_nit) cliByFactNit.set(String(c.factura_a_nit).trim(), c.id);
    }
  }

  // 5) Upserts por lotes (preserva las conciliadas a mano; reemplaza líneas del resto).
  let auto = 0, pendiente = 0, mostrador = 0, conciliada = 0, conSaldo = 0;
  for (let i = 0; i < facturas.length; i += 100) {
    const batch = facturas.slice(i, i + 100);
    const ids = batch.map((f) => f.id);
    const { data: prev } = await s.from("siigo_facturas").select("siigo_id, estado_conciliacion").in("siigo_id", ids);
    const locked = new Set((prev ?? []).filter((x) => x.estado_conciliacion === "conciliada").map((x) => x.siigo_id));
    // Las que están en la cola de conciliación tampoco se cierran solas como mostrador:
    // alguien las puso ahí a mano (ver devolverACola en /pagos) y deben seguir visibles.
    const enCola = new Set((prev ?? []).filter((x) => x.estado_conciliacion === "pendiente").map((x) => x.siigo_id));

    // deno-lint-ignore no-explicit-any
    const normalRows: any[] = [];
    // deno-lint-ignore no-explicit-any
    const lockedRows: any[] = [];
    for (const f of batch) {
      const ident = f.customer?.identification ? String(f.customer.identification).trim() : null;
      const saldo = Math.round(f.balance ?? 0);
      const total = Math.round(f.total ?? 0);
      if (saldo > 0) conSaldo++;
      if (locked.has(f.id)) {
        lockedRows.push({ siigo_id: f.id, total, saldo });
        conciliada++;
        continue;
      }
      const esReal = !!ident && !GENERIC.test(ident);
      // La cédula manda; si no empareja, se intenta por NIT de facturación.
      const clienteId = esReal ? cliByDoc.get(ident!) ?? cliByFactNit.get(ident!) ?? null : null;
      let estado: string;
      if (clienteId) { estado = "auto"; auto++; }
      else if (saldo > 0 || esReal) { estado = "pendiente"; pendiente++; } // cédula real = conciliable
      else if (enCola.has(f.id)) { estado = "pendiente"; pendiente++; }    // rescatada a mano: se respeta
      else { estado = "mostrador"; mostrador++; }
      normalRows.push({
        siigo_id: f.id, numero: f.name, fecha: f.date,
        cliente_identificacion: ident,
        cliente_nombre_siigo: esReal ? nombrePorNit.get(ident!) ?? null : null,
        cliente_id: clienteId, total, saldo, estado_conciliacion: estado,
      });
    }

    // Las conciliadas a mano solo refrescan total/saldo. Va update por fila: el upsert
    // parcial rebota contra el NOT NULL de `fecha` (fallaba en silencio).
    for (const lr of lockedRows) {
      const { error } = await s
        .from("siigo_facturas")
        .update({ total: lr.total, saldo: lr.saldo })
        .eq("siigo_id", lr.siigo_id);
      if (error) throw new Error(`refrescar conciliada ${lr.siigo_id}: ${error.message}`);
    }

    let idBySiigo = new Map<string, number>();
    if (normalRows.length) {
      const { data: facs, error } = await s
        .from("siigo_facturas")
        .upsert(normalRows, { onConflict: "siigo_id" })
        .select("id, siigo_id");
      if (error) throw new Error("upsert facturas: " + error.message);
      idBySiigo = new Map((facs ?? []).map((x) => [x.siigo_id, x.id]));
    }
    const facIds = [...idBySiigo.values()];
    if (facIds.length) await s.from("siigo_factura_lineas").delete().in("factura_id", facIds);
    // deno-lint-ignore no-explicit-any
    const lines: any[] = [];
    for (const f of batch) {
      const facId = idBySiigo.get(f.id);
      if (!facId) continue;
      for (const it of f.items ?? []) {
        lines.push({
          factura_id: facId, codigo: it.code ?? null, descripcion: it.description ?? null,
          servicio_id: it.code ? prodByCode.get(it.code)?.servicio_id ?? null : null,
          monto: Math.round(it.total ?? 0), cantidad: it.quantity ?? 1,
        });
      }
    }
    for (let j = 0; j < lines.length; j += 500) await s.from("siigo_factura_lineas").insert(lines.slice(j, j + 500));
  }

  const ncAnuladas = await reconciliarNotasCredito(s);

  await touch();
  return `${mode}: ${facturas.length} facturas · ${ncAnuladas} anuladas por NC · saldos actualizados ${abiertasAct} | auto ${auto} · pendiente ${pendiente} · mostrador ${mostrador} · conciliada ${conciliada} | con saldo ${conSaldo}`;
}

Deno.serve(async (req) => {
  if (req.headers.get("x-sync-secret") !== Deno.env.get("SYNC_SECRET")) {
    return new Response("forbidden", { status: 403 });
  }
  let mode: "incremental" | "refresh" = "incremental";
  try {
    const b = await req.json();
    if (b?.mode === "refresh") mode = "refresh";
  } catch {
    // sin body = incremental
  }

  const job = runSync(mode)
    .then((r) => console.log("✅ siigo-sync", r))
    .catch((e) => console.error("❌ siigo-sync", e));

  // En Supabase Edge Runtime el trabajo sigue en background y respondemos ya.
  const er = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (er?.waitUntil) {
    er.waitUntil(job);
    return new Response(JSON.stringify({ ok: true, mode, background: true }), {
      status: 202,
      headers: { "Content-Type": "application/json" },
    });
  }
  await job;
  return new Response(JSON.stringify({ ok: true, mode }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
