-- ============================================================================
-- 0017 · Compensación de academia transversal por profesor (soporta multi-profesor)
-- ============================================================================

-- Valor por alumno que gana el profesor en CUALQUIER academia que dicte
-- (transversal). La liquidación de academia usa: alumnos presentes × esta tarifa,
-- atribuida al profesor que dictó la clase (clases.profesor_id).
alter table public.profesor_compensacion
  add column valor_alumno_academia integer not null default 0 check (valor_alumno_academia >= 0);

-- Nota: academias.valor_alumno (de 0015) queda en desuso; la tarifa de academia
-- ahora es por profesor, no por academia. Se conserva la columna para no romper datos.
