/**
 * Crea (o asegura) un superadministrador para desarrollo.
 *
 * Uso:
 *   node --env-file=.env scripts/seed-admin.mjs <email> <password> ["Nombre"]
 *
 * Pasos:
 *  1) signUp en Supabase Auth (crea el usuario; el trigger crea su profile).
 *  2) Confirma el email y eleva el rol a 'superadmin' vía SQL directo
 *     (necesario porque el bootstrap del primer admin no puede pasar por RLS).
 */
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const [email, password, nombre = "Administrador"] = process.argv.slice(2);
if (!email || !password) {
  console.error('Uso: node --env-file=.env scripts/seed-admin.mjs <email> <password> ["Nombre"]');
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

// 1) signUp (idempotente: ignora "already registered")
const { error } = await supabase.auth.signUp({ email, password });
if (error && !/already|registered|exists/i.test(error.message)) {
  console.error("❌ signUp:", error.message);
  process.exit(1);
}

// 2) confirmar email + rol superadmin (SQL directo, bypassa RLS)
const client = new pg.Client({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT) || 5432,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
await client.query(
  "update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where email = $1",
  [email],
);
const r = await client.query(
  `update public.profiles
     set role = 'superadmin', nombre = coalesce(nombre, $2)
   where id = (select id from auth.users where email = $1)
   returning id, role, nombre`,
  [email, nombre],
);
await client.end();

if (r.rows.length === 0) {
  console.error("❌ No se encontró el usuario tras signUp.");
  process.exit(1);
}
console.log("✅ Superadmin listo:", email, JSON.stringify(r.rows[0]));
