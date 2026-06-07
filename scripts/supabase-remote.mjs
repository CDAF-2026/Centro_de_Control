#!/usr/bin/env node
/**
 * Ejecuta la CLI de Supabase contra el proyecto REMOTO del CDAF usando
 * DATABASE_URL del entorno. Cargar con:
 *   node --env-file=.env scripts/supabase-remote.mjs <comando>
 *
 * Pasa la URL como ARGUMENTO (sin shell), evitando problemas con el '$' del
 * password. Se añade `--db-url <DATABASE_URL>` automáticamente al final.
 */
import { execFileSync } from "node:child_process";

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error(
    "❌ Falta DATABASE_URL. Ejecuta con: node --env-file=.env scripts/supabase-remote.mjs <args>",
  );
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error(
    "Uso: node --env-file=.env scripts/supabase-remote.mjs <comando supabase>",
  );
  process.exit(1);
}

try {
  execFileSync("npx", ["--no-install", "supabase", ...args, "--db-url", dbUrl], {
    stdio: "inherit",
  });
} catch (e) {
  process.exit(e.status ?? 1);
}
