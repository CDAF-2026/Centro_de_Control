/**
 * Despliega la Edge Function `turnos-limpiar-fotos` vía la Management API (HTTPS).
 * Borra las fotos de turno de más de un mes; el registro del turno se conserva.
 *
 * verify_jwt=false: la protege el header x-sync-secret, no un JWT — así puede
 * invocarla pg_cron. Mismo patrón que `siigo-sync`.
 *
 * Uso: node --env-file=.env scripts/deploy-turnos-fn.mjs
 * Requiere en .env: SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF, SYNC_SECRET.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REF = process.env.SUPABASE_PROJECT_REF;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const SECRET = process.env.SYNC_SECRET;
if (!REF || !TOKEN || !SECRET) {
  console.error("❌ Faltan SUPABASE_PROJECT_REF / SUPABASE_ACCESS_TOKEN / SYNC_SECRET en .env");
  process.exit(1);
}

const API = "https://api.supabase.com/v1";
const H = { Authorization: `Bearer ${TOKEN}` };
const HJ = { ...H, "Content-Type": "application/json" };
const SLUG = "turnos-limpiar-fotos";

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "functions", SLUG, "index.ts"),
  "utf8",
);

// SYNC_SECRET ya lo sube deploy-siigo-fn; se reafirma aquí para que esta función
// se pueda desplegar sola en un proyecto nuevo.
await fetch(`${API}/projects/${REF}/secrets`, {
  method: "POST",
  headers: HJ,
  body: JSON.stringify([{ name: "SYNC_SECRET", value: SECRET }]),
});

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
if (!r.ok) {
  console.error(`❌ deploy: HTTP ${r.status} ${await r.text()}`);
  process.exit(1);
}
console.log(`✅ Edge Function \`${SLUG}\` desplegada.`);
