/**
 * Programa el cron que borra las fotos de turno de más de un mes:
 *   · turnos-limpiar-fotos : 07:40 UTC = 02:40 a. m. en Bogotá, con el club cerrado.
 * Idempotente: des-agenda el job si ya existe y lo vuelve a crear.
 *
 * Uso: node --env-file=.env scripts/schedule-turnos-cron.mjs
 * Requiere en .env: SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF, SYNC_SECRET.
 */
const REF = process.env.SUPABASE_PROJECT_REF;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const SECRET = process.env.SYNC_SECRET;
if (!REF || !TOKEN || !SECRET) {
  console.error("❌ Faltan SUPABASE_PROJECT_REF / SUPABASE_ACCESS_TOKEN / SYNC_SECRET en .env");
  process.exit(1);
}

const URL_FN = `https://${REF}.supabase.co/functions/v1/turnos-limpiar-fotos`;

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

const job = `
  select net.http_post(
    url := '${URL_FN}',
    body := '{}'::jsonb,
    headers := '{"Content-Type":"application/json","x-sync-secret":"${SECRET}"}'::jsonb,
    timeout_milliseconds := 30000
  );`;

await q(`select cron.unschedule(jobid) from cron.job where jobname = 'turnos-limpiar-fotos';`);
await q(`select cron.schedule('turnos-limpiar-fotos', '40 7 * * *', $job$${job}$job$);`);

const jobs = await q(
  `select jobname, schedule, active from cron.job where jobname = 'turnos-limpiar-fotos';`,
);
console.log("✅ Cron programado:");
for (const j of jobs ?? []) console.log(`   ${j.jobname} · ${j.schedule} · ${j.active ? "activo" : "inactivo"}`);
console.log("   (07:40 UTC = 02:40 a. m. en Bogotá, con el club cerrado)");
