-- ============================================================================
-- 0024 · Sync automática de Siigo — extensiones de programación
-- ----------------------------------------------------------------------------
-- pg_cron (agenda de tareas) + pg_net (llamadas HTTP desde Postgres) para
-- invocar la Edge Function `siigo-sync`:
--   · cada 20 min  → {"mode":"incremental"}  (facturas nuevas desde el cursor)
--   · cada noche   → {"mode":"refresh"}      (refresca saldos/estados viejos)
-- Los cron.schedule NO van en esta migración porque llevan el secreto de la
-- función: se crean con `node --env-file=.env scripts/schedule-siigo-cron.mjs`.
-- ============================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;
