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

await auth();

const catalogo = [];
for (let page = 1; ; page++) {
  const r = await sg(`/v1/products?page=${page}&page_size=100`);
  const res = r.results ?? [];
  for (const p of res) {
    catalogo.push({ codigo: p.code, nombre: p.name, grupo_id: p.account_group?.id ?? null, grupo: p.account_group?.name ?? null });
  }
  if (res.length < 100) break;
}

// La regla es la MISMA del sync, porque es la misma función de SQL (`siigo_catalogo_aplicar`):
// código primero, luego número de grupo, y crea el servicio de un grupo nuevo. Con --dry la
// función calcula todo y lo revierte, y devuelve lo que habría pasado en el detalle del error.
const { data: antes } = await s.from("siigo_productos").select("codigo, account_group, servicio_id").limit(10000);

let cat;
{
  const { data, error } = await s.rpc("siigo_catalogo_aplicar", { p_productos: catalogo, p_simulacro: dry });
  if (dry) {
    if (error?.message !== "SIMULACRO") throw new Error(error?.message ?? "el simulacro no se revirtió");
    cat = JSON.parse(error.details);
  } else {
    if (error) throw new Error(error.message);
    cat = data;
  }
}

const antesPorCodigo = new Map((antes ?? []).map((p) => [p.codigo, p]));
const cambios = catalogo.filter((f) => {
  const a = antesPorCodigo.get(f.codigo);
  return !a || a.account_group !== f.grupo || a.servicio_id !== cat.servicio_por_codigo[f.codigo];
});

console.log(`productos en Siigo: ${catalogo.length} · cambian: ${cambios.length}`);
for (const c of cambios.slice(0, 30)) {
  const a = antesPorCodigo.get(c.codigo);
  const de = a ? `${JSON.stringify(a.account_group)} → servicio ${a.servicio_id ?? "null"}` : "(nuevo)";
  console.log(`  ${c.codigo.padEnd(14)} ${de}  ⇒  ${JSON.stringify(c.grupo)} → servicio ${cat.servicio_por_codigo[c.codigo] ?? "null"}`);
}
if (cambios.length > 30) console.log(`  … y ${cambios.length - 30} más`);

for (const c of cat.creados) console.log(`🆕 grupo nuevo en Siigo → servicio ${dry ? "que se crearía" : "creado"}: ${c.nombre}`);
for (const r of cat.renombrados) console.log(`✏️  grupo renombrado en Siigo: ${r.antes} → ${r.ahora}`);
if (cat.lineas_recategorizadas) console.log(`líneas sin categoría que ${dry ? "se categorizarían" : "se categorizaron"}: ${cat.lineas_recategorizadas}`);

// Productos que siguen sin servicio (grupo vacío o ya cubierto a medias por códigos).
const huerfanos = new Map();
for (const f of catalogo) {
  if (f.grupo && cat.servicio_por_codigo[f.codigo] == null) huerfanos.set(f.grupo, (huerfanos.get(f.grupo) ?? 0) + 1);
}
if (huerfanos.size) {
  console.log("\n⚠️  productos de Siigo SIN servicio (su facturación entraría sin categoría):");
  for (const [g, n] of huerfanos) console.log(`   ${JSON.stringify(g)} · ${n} producto(s)`);
} else {
  console.log("\n✅ todos los productos de Siigo tienen servicio asignado.");
}

console.log(dry ? "\n(simulacro: no se escribió nada)" : `\n✅ caché actualizado (${catalogo.length} productos).`);
