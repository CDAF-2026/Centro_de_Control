/**
 * Refresca SOLO el caché de productos de Siigo (código → grupo → servicio).
 *
 * Por qué existe aparte del sync: el sync completo refresca este caché únicamente
 * cuando encuentra facturas nuevas, y con el rezago de ~1 día de Siigo puede pasar
 * medio día sin refrescarlo. Cuando el club renombra un grupo de producto —pasó el
 * 30-jul-2026 con los cuatro de academia— hay que poder re-emparejar de inmediato,
 * sin esperar a que entre facturación y sin importar facturas de paso.
 *
 * Uso:  node --env-file=.env scripts/sync-productos-siigo.mjs
 *       (agrega --dry para ver qué cambiaría sin escribir)
 */
import { createClient } from "@supabase/supabase-js";

const dry = process.argv.includes("--dry");
const SIIGO = process.env.SIIGO_API_URL ?? "https://api.siigo.com";
const PARTNER_ID = process.env.SIIGO_PARTNER_ID ?? "CentroDeportivoAlejandroFalla";

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let token = null;
async function auth() {
  const r = await fetch(`${SIIGO}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Partner-Id": PARTNER_ID },
    body: JSON.stringify({ username: process.env.SIIGO_USERNAME, access_key: process.env.SIIGO_ACCESS_KEY }),
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

// Mismo emparejamiento que el sync: trim + lowercase sobre el nombre del grupo.
const { data: servicios } = await s.from("servicios").select("id, nombre, siigo_grupo");
const porGrupo = new Map();
for (const sv of servicios ?? []) if (sv.siigo_grupo) porGrupo.set(sv.siigo_grupo.trim().toLowerCase(), sv);
const servicioDeGrupo = (g) => (g ? porGrupo.get(String(g).trim().toLowerCase()) ?? null : null);

await auth();

const filas = [];
for (let page = 1; ; page++) {
  const r = await sg(`/v1/products?page=${page}&page_size=100`);
  const res = r.results ?? [];
  for (const p of res) {
    const grupo = p.account_group?.name ?? null;
    filas.push({
      codigo: p.code,
      nombre: p.name,
      account_group: grupo,
      servicio_id: servicioDeGrupo(grupo)?.id ?? null,
      updated_at: new Date().toISOString(),
    });
  }
  if (res.length < 100) break;
}

// Qué cambia respecto de lo que hay guardado
const { data: antes } = await s.from("siigo_productos").select("codigo, account_group, servicio_id");
const antesPorCodigo = new Map((antes ?? []).map((p) => [p.codigo, p]));
const cambios = filas.filter((f) => {
  const a = antesPorCodigo.get(f.codigo);
  return !a || a.account_group !== f.account_group || a.servicio_id !== f.servicio_id;
});

console.log(`productos en Siigo: ${filas.length} · cambian: ${cambios.length}`);
for (const c of cambios.slice(0, 30)) {
  const a = antesPorCodigo.get(c.codigo);
  const de = a ? `${JSON.stringify(a.account_group)} → servicio ${a.servicio_id ?? "null"}` : "(nuevo)";
  console.log(`  ${c.codigo.padEnd(14)} ${de}  ⇒  ${JSON.stringify(c.account_group)} → servicio ${c.servicio_id ?? "null"}`);
}
if (cambios.length > 30) console.log(`  … y ${cambios.length - 30} más`);

// Grupos que ningún servicio reclama: es la plata que entraría sin categoría.
const huerfanos = new Map();
for (const f of filas) if (f.account_group && !f.servicio_id) huerfanos.set(f.account_group, (huerfanos.get(f.account_group) ?? 0) + 1);
if (huerfanos.size) {
  console.log("\n⚠️  grupos de Siigo SIN servicio asignado (su facturación entraría sin categoría):");
  for (const [g, n] of huerfanos) console.log(`   ${JSON.stringify(g)} · ${n} producto(s)`);
} else {
  console.log("\n✅ todos los grupos de Siigo tienen servicio asignado.");
}

if (dry) {
  console.log("\n(simulacro: no se escribió nada)");
} else {
  for (let i = 0; i < filas.length; i += 500) {
    const { error } = await s.from("siigo_productos").upsert(filas.slice(i, i + 500), { onConflict: "codigo" });
    if (error) throw new Error(error.message);
  }
  console.log(`\n✅ caché actualizado (${filas.length} productos).`);
}
