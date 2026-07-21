-- ============================================================================
-- 0034 · H3 · La asistencia se lleva por MIEMBRO (hermano), no por ficha
-- ----------------------------------------------------------------------------
-- Dos hermanos comparten cliente_id (la ficha familiar), así que la unicidad
-- por (clase_id, cliente_id) hacía que ambos chocaran en la misma clase y solo
-- contara uno → cobro y liquidación por 1 alumno en vez de 2. Ahora la unicidad
-- es por (clase_id, miembro_id): cada hermano tiene su propia asistencia.
-- miembro_id ya viene poblado (backfill del titular en 0033).
-- ============================================================================

alter table public.asistencias drop constraint if exists asistencias_clase_id_cliente_id_key;

create unique index if not exists asistencias_clase_miembro_idx
  on public.asistencias (clase_id, miembro_id);
