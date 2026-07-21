-- ============================================================================
-- 0035 · Fix: soltar la unicidad vieja (academia_id, cliente_id) de inscripciones
-- ----------------------------------------------------------------------------
-- En 0033 se intentó soltar la restricción con un nombre equivocado, así que
-- seguía viva y bloqueaba a dos hermanos (misma ficha) en la misma academia.
-- La unicidad correcta por (miembro_id, academia_id) where activa ya existe.
-- ============================================================================

alter table public.inscripciones drop constraint if exists inscripciones_academia_id_cliente_id_key;
