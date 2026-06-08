-- ============================================================================
-- 0010 · Contacto de emergencia con campos separados (nombre, celular, parentesco)
-- ============================================================================

alter table public.clientes
  drop column if exists contacto_emergencia,
  add column emergencia_nombre text,
  add column emergencia_celular text,
  add column emergencia_parentesco text;
