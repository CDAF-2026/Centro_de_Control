-- Limpieza del modelo viejo de academias (ago-2026).
--
-- El horario dejó de ser del NIÑO y pasó a ser del GRUPO: hoy se llega por
-- `academia_grupo` → `grupo_franja` → `inscripcion_franja`. Todo lo que sigue
-- quedó sin lector, y medido antes de borrar está VACÍO:
--   inscripcion_horarios .......... 0 filas
--   inscripciones.nivel ........... 0 con valor
--   inscripciones.dias ............ 0 con valor
--   academias.dias_semana ......... 0 con valor
--   inscripciones sin grupo_id .... 0 de 100
-- Se borra en vez de dejarlo "por si acaso" (decisión de Laura): una columna
-- muerta que sigue en la tabla es una invitación a que alguien la lea y saque
-- una cifra falsa, como pasó con `inscripciones.dias` en el cierre.

-- ── 1. Los RPCs del tablero viejo, que leían inscripcion_horarios ──
-- Los reemplazaron `grupo_franjas` y `grupo_inscritos_por_franja`, que miden
-- por FRANJA (que es la clase que de verdad ocurre) y no por niño suelto.
drop function if exists public.academia_rendimiento_franja(bigint, date, date);
drop function if exists public.academia_rendimiento_nino(bigint, date, date);
drop function if exists public.academia_clases_periodo(bigint, date, date);
drop function if exists public.academia_asistencia_clase(bigint);

-- ── 2. El horario por inscrito ──
drop table if exists public.inscripcion_horarios;

-- ── 3. Columnas muertas de `inscripciones` ──
-- `dias` y `plan_frecuencia`: la frecuencia se CUENTA (3 franjas = 3×sem), no se
-- declara. `nivel`: el nivel es del grupo, no del niño.
alter table public.inscripciones
  drop column if exists dias,
  drop column if exists plan_frecuencia,
  drop column if exists nivel;

-- Un inscrito SIEMPRE pertenece a un grupo: es lo que decide su horario, su
-- cupo y a quién se espera al cerrar la clase. Sin grupo, la inscripción no
-- alimenta nada y desaparece de todas las pantallas sin dejar rastro.
alter table public.inscripciones
  alter column grupo_id set not null;

comment on column public.inscripciones.grupo_id is
  'Grupo al que pertenece el niño. Obligatorio: de él salen su horario, su cupo y el roster del cierre.';

-- ── 4. Columnas muertas de `academias` ──
-- Una academia hoy es un SERVICIO (recreativa/competencia × tenis/pádel). El
-- horario, el profesor y la cancha bajaron a `grupo_franja`; el nivel subió al
-- grupo; y el dinero sale de Siigo (`servicio_id`), no de estos valores.
alter table public.academias
  drop column if exists nivel,
  drop column if exists profesor_id,
  drop column if exists cancha,
  drop column if exists horario,
  drop column if exists dias_semana,
  drop column if exists hora_inicio,
  drop column if exists hora_fin,
  drop column if exists valor_alumno,
  drop column if exists periodo_inicio,
  drop column if exists periodo_fin;
