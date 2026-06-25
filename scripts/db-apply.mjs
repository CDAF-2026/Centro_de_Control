#!/usr/bin/env node
/**
 * Aplica las migraciones pendientes contra el proyecto REMOTO del CDAF usando la
 * Management API de Supabase por HTTPS (puerto 443).
 *
 * Pensado para entornos que NO pueden abrir el Postgres directo (IPv6, p. ej. el
 * agente o una red sin ruta IPv6) ni el pooler (5432). Es el mismo canal que usa
 * el SQL Editor / el MCP, pero autenticado con un Personal Access Token propio.
 *
 * Requiere en el entorno (cárgalo con --env-file=.env):
 *   SUPABASE_ACCESS_TOKEN  Personal Access Token
 *                          (Dashboard → Account → Access Tokens → Generate new token)
 *   SUPABASE_PROJECT_REF   ref del proyecto (ya está en .env)
 *
 * Uso:
 *   node --env-file=.env scripts/db-apply.mjs            # aplica todas las pendientes
 *   node --env-file=.env scripts/db-apply.mjs --dry-run  # solo lista las pendientes
 *
 * Mantiene el historial supabase_migrations.schema_migrations al día, así que
 * `npm run db:push` (cuando la red tenga IPv6) seguirá viendo todo como aplicado.
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF;
const DRY = process.argv.includes("--dry-run");

if (!TOKEN || !REF) {
  console.error(
    "❌ Faltan variables. Necesito SUPABASE_ACCESS_TOKEN y SUPABASE_PROJECT_REF.\n" +
      "   Crea un Personal Access Token en el Dashboard → Account → Access Tokens\n" +
      "   y agrégalo a .env como SUPABASE_ACCESS_TOKEN=sbp_...",
  );
  process.exit(1);
}

const API = `https://api.supabase.com/v1/projects/${REF}/database/query`;

/** Ejecuta SQL contra el proyecto y devuelve las filas (o null). */
async function runSql(query) {
  const res = await fetch(API, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Management API HTTP ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

const migDir = join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "migrations");
const parse = (f) => {
  const m = f.match(/^(\d+)_(.+)\.sql$/);
  return m ? { version: m[1], name: m[2], file: f } : null;
};
const migs = readdirSync(migDir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map(parse)
  .filter(Boolean);

// Asegura el esquema/tabla de historial (la CLI ya los crea; esto es por si acaso).
await runSql(
  `create schema if not exists supabase_migrations;
   create table if not exists supabase_migrations.schema_migrations (
     version text primary key, name text, statements text[]
   );`,
);

const appliedRows = await runSql(
  "select version from supabase_migrations.schema_migrations order by version;",
);
const applied = new Set((appliedRows ?? []).map((r) => r.version));
const pending = migs.filter((m) => !applied.has(m.version));

if (pending.length === 0) {
  console.log("✅ No hay migraciones pendientes.");
  process.exit(0);
}

console.log(`Migraciones pendientes (${pending.length}):`);
for (const m of pending) console.log(`  • ${m.version}  ${m.name}`);
if (DRY) process.exit(0);

for (const m of pending) {
  const sql = readFileSync(join(migDir, m.file), "utf8");
  process.stdout.write(`→ Aplicando ${m.version}_${m.name} … `);
  await runSql(sql);
  const nameEsc = m.name.replace(/'/g, "''");
  await runSql(
    `insert into supabase_migrations.schema_migrations (version, name)
     values ('${m.version}', '${nameEsc}') on conflict (version) do nothing;`,
  );
  console.log("ok");
}

console.log(`\n✅ ${pending.length} migración(es) aplicada(s) por la Management API.`);
