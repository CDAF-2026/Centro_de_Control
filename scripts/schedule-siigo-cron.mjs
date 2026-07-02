/**
 * Programa (o re-programa) los cron jobs que invocan la Edge Function `siigo-sync`:
 *   · siigo-sync-incremental : cada 20 min  → {"mode":"incremental"}
 *   · siigo-sync-refresh     : 08:15 UTC (03:15 Bogotá) → {"mode":"refresh"}
 * Idempotente: des-agenda los jobs si ya existen y los vuelve a crear.
 * Requiere la migración 0024 (pg_cron + pg_net) aplicada.
 *
 * Uso: node --env-file=.env scripts/schedule-siigo-cron.mjs
 * Requiere en .env: SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF, SYNC_SECRET.
 */
const REF = process.env.SUPABASE_PROJECT_REF;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const SECRET = process.env.SYNC_SECRET;
if (!REF || !TOKEN || !SECRET) {
  console.error("❌ Faltan SUPABASE_PROJECT_REF / SUPABASE_ACCESS_TOKEN / SYNC_SECRET en .env");
  process.exit(1);
}

const URL_FN = `https://${REF}.supabase.co/functions/v1/siigo-sync`;

async function q(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`SQL: HTTP ${r.status} ${t}`);
  return t ? JSON.parse(t) : null;
}

const job = (mode) => `
  select net.http_post(
    url := '${URL_FN}',
    body := '{"mode":"${mode}"}'::jsonb,
    headers := '{"Content-Type":"application/json","x-sync-secret":"${SECRET}"}'::jsonb,
    timeout_milliseconds := 15000
  );`;

await q(`select cron.unschedule(jobid) from cron.job where jobname in ('siigo-sync-incremental','siigo-sync-refresh');`);
await q(`select cron.schedule('siigo-sync-incremental', '*/20 * * * *', $job$${job("incremental")}$job$);`);
await q(`select cron.schedule('siigo-sync-refresh', '15 8 * * *', $job$${job("refresh")}$job$);`);

const jobs = await q(`select jobname, schedule, active from cron.job where jobname like 'siigo-sync%' order by jobname;`);
console.log("✅ Cron jobs programados:");
for (const j of jobs ?? []) console.log(`   ${j.jobname} · ${j.schedule} · ${j.active ? "activo" : "inactivo"}`);
console.log("   (horarios en UTC; 08:15 UTC = 03:15 a. m. en Bogotá)");
