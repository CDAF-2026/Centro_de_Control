-- ============================================================================
-- 0007 · Horario estructurado de academias (para programación automática)
-- ============================================================================

alter table public.academias
  add column dias_semana smallint[] not null default '{}', -- 0=domingo … 6=sábado
  add column hora_inicio time,
  add column hora_fin time;
