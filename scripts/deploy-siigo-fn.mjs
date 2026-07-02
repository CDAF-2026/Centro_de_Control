/**
 * Despliega la Edge Function `siigo-sync` vía la Management API de Supabase (HTTPS).
 * - Sube los secretos que la función necesita (SIIGO_USERNAME, SIIGO_ACCESS_KEY, SYNC_SECRET).
 * - Crea la función (o la actualiza si ya existe) con verify_jwt=false: la protege
 *   el header x-sync-secret, no un JWT (así pg_cron puede invocarla).
 *
 * Uso: node --env-file=.env scripts/deploy-siigo-fn.mjs
 * Requiere en .env: SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF,
 *                   SIIGO_USERNAME, SIIGO_ACCESS_KEY, SYNC_SECRET.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REF = process.env.SUPABASE_PROJECT_REF;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const SECRETS = {
  SIIGO_USERNAME: process.env.SIIGO_USERNAME,
  SIIGO_ACCESS_KEY: process.env.SIIGO_ACCESS_KEY,
  SYNC_SECRET: process.env.SYNC_SECRET,
};
for (const [k, v] of Object.entries({ SUPABASE_PROJECT_REF: REF, SUPABASE_ACCESS_TOKEN: TOKEN, ...SECRETS })) {
  if (!v) {
    console.error(`❌ Falta ${k} en .env`);
    process.exit(1);
  }
}

const API = "https://api.supabase.com/v1";
const H = { Authorization: `Bearer ${TOKEN}` };
const HJ = { ...H, "Content-Type": "application/json" };
const SLUG = "siigo-sync";

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "functions", SLUG, "index.ts"),
  "utf8",
);

// 1) Secretos (borrar si existen y volver a crear = upsert).
{
  await fetch(`${API}/projects/${REF}/secrets`, {
    method: "DELETE",
    headers: HJ,
    body: JSON.stringify(Object.keys(SECRETS)),
  }).catch(() => {});
  const r = await fetch(`${API}/projects/${REF}/secrets`, {
    method: "POST",
    headers: HJ,
    body: JSON.stringify(Object.entries(SECRETS).map(([name, value]) => ({ name, value }))),
  });
  if (!r.ok) throw new Error(`secrets: HTTP ${r.status} ${await r.text()}`);
  console.log("✔ Secretos subidos:", Object.keys(SECRETS).join(", "));
}

// 2) Función: crear; si ya existe, actualizar. Fallback: endpoint multipart /deploy.
async function createJson() {
  return fetch(`${API}/projects/${REF}/functions`, {
    method: "POST",
    headers: HJ,
    body: JSON.stringify({ slug: SLUG, name: SLUG, verify_jwt: false, body: source }),
  });
}
async function patchJson() {
  return fetch(`${API}/projects/${REF}/functions/${SLUG}`, {
    method: "PATCH",
    headers: HJ,
    body: JSON.stringify({ name: SLUG, verify_jwt: false, body: source }),
  });
}
async function deployMultipart() {
  const form = new FormData();
  form.append("metadata", JSON.stringify({ entrypoint_path: "index.ts", name: SLUG, verify_jwt: false }));
  form.append("file", new File([source], "index.ts", { type: "application/typescript" }));
  return fetch(`${API}/projects/${REF}/functions/deploy?slug=${SLUG}`, { method: "POST", headers: H, body: form });
}

let r = await createJson();
if (r.status === 409) r = await patchJson();
if (!r.ok) {
  console.warn(`create/patch → HTTP ${r.status}; probando multipart /deploy…`);
  r = await deployMultipart();
}
if (!r.ok) throw new Error(`deploy: HTTP ${r.status} ${await r.text()}`);
const fn = await r.json();
console.log(`✔ Función desplegada: ${fn.slug ?? SLUG} (status: ${fn.status ?? "?"}, version: ${fn.version ?? "?"})`);
console.log(`  URL: https://${REF}.supabase.co/functions/v1/${SLUG}`);
