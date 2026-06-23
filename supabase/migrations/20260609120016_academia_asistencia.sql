-- ============================================================================
-- 0016 · Academias — días por inscripción + asistencia con estado + no inscritos
-- ============================================================================

-- Días que el alumno asiste dentro de la academia (0=domingo .. 6=sábado),
-- subconjunto de academias.dias_semana. Vacío = sin días definidos aún.
alter table public.inscripciones
  add column dias smallint[] not null default '{}';

-- Estado de asistencia (más detalle que el booleano 'presente', para academias).
create type public.asistencia_estado as enum ('presente', 'ausente', 'excusa_medica', 'reposicion');
alter table public.asistencias
  add column estado public.asistencia_estado not null default 'presente';
-- Backfill desde el booleano existente.
update public.asistencias set estado = 'ausente' where presente = false;

-- Asistentes que vinieron pero no estaban inscritos (control de clases extra no contratadas).
alter table public.clases
  add column asistentes_no_registrados text;
