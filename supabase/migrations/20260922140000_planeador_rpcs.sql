-- Consultas del planeador (22-sep-2026)
--
-- Todas devuelven `profesor_id` y NUNCA el nombre: `profiles_select` solo deja
-- ver el propio perfil salvo a SA/CA, así que un join a `profiles` le saldría
-- vacío a recepción y al coordinador deportivo (regla 9). El nombre lo resuelve
-- la pantalla con `mapaNombresStaff()`.

begin;

-- La semana entera del club: una fila por clase del planeador.
create or replace function public.planeador_semana(p_deporte public.deporte default 'tenis')
returns table (
  clase_id bigint, profesor_id uuid, dia_semana smallint, hora_inicio time,
  duracion_min smallint, cancha text, ninos int, recreativa int, competencia int
)
language sql stable set search_path to 'public' as $$
  select cs.id, cs.profesor_id, cs.dia_semana, cs.hora_inicio, cs.duracion_min, cs.cancha,
         count(x.id)::int,
         count(*) filter (where a.categoria = 'recreativa')::int,
         count(*) filter (where a.categoria = 'competencia')::int
  from clase_semanal cs
  left join inscripcion_clase x on x.clase_id = cs.id
  left join inscripciones i on i.id = x.inscripcion_id and i.activa
  left join academias a on a.id = i.academia_id
  where cs.activa and cs.deporte = p_deporte
  group by cs.id
  order by cs.dia_semana, cs.hora_inicio;
$$;

-- Quiénes vienen a una clase. `otras_clases` es cuántas MÁS tiene ese niño a la
-- semana: sirve para no retirarlo de la academia creyendo que era su único día.
create or replace function public.clase_semanal_roster(p_clase bigint)
returns table (
  inscripcion_id bigint, miembro_id bigint, cliente_id bigint, nombre text, edad int,
  academia_id bigint, categoria text, otras_clases int
)
language sql stable set search_path to 'public' as $$
  select i.id, i.miembro_id, i.cliente_id,
         m.apellidos || ', ' || m.nombres,
         extract(year from age(m.fecha_nacimiento))::int,
         a.id, a.categoria,
         (select count(*)::int from inscripcion_clase y
          where y.inscripcion_id = i.id and y.clase_id <> p_clase)
  from inscripcion_clase x
  join inscripciones i on i.id = x.inscripcion_id and i.activa
  join cliente_miembros m on m.id = i.miembro_id and m.activo
  join academias a on a.id = i.academia_id
  where x.clase_id = p_clase
  order by 4;
$$;

-- La matrícula de una academia: quién está, desde cuándo y a qué clases va.
-- `clases` viene en jsonb para que la pantalla pinte un chip por clase sin
-- pedir una consulta más por niño (N+1).
create or replace function public.academia_matricula(p_academia bigint)
returns table (
  inscripcion_id bigint, miembro_id bigint, cliente_id bigint, nombre text, edad int,
  desde date, n_clases int, clases jsonb
)
language sql stable set search_path to 'public' as $$
  select i.id, i.miembro_id, i.cliente_id,
         m.apellidos || ', ' || m.nombres,
         extract(year from age(m.fecha_nacimiento))::int,
         i.fecha_inscripcion,
         count(cs.id)::int,
         coalesce(
           jsonb_agg(
             jsonb_build_object('id', cs.id, 'dia', cs.dia_semana,
                                'hora', to_char(cs.hora_inicio, 'HH24:MI'),
                                'profesorId', cs.profesor_id)
             order by cs.dia_semana, cs.hora_inicio
           ) filter (where cs.id is not null),
           '[]'::jsonb)
  from inscripciones i
  join cliente_miembros m on m.id = i.miembro_id and m.activo
  left join inscripcion_clase x on x.inscripcion_id = i.id
  left join clase_semanal cs on cs.id = x.clase_id and cs.activa
  where i.academia_id = p_academia and i.activa
  group by i.id, m.apellidos, m.nombres, m.fecha_nacimiento
  order by 4;
$$;

-- Las clases de un niño, para su ficha.
create or replace function public.miembro_clases_academia(p_miembro bigint)
returns table (
  inscripcion_id bigint, academia_id bigint, academia text, categoria text,
  clase_id bigint, dia_semana smallint, hora_inicio time, duracion_min smallint, profesor_id uuid
)
language sql stable set search_path to 'public' as $$
  select i.id, a.id, a.nombre, a.categoria,
         cs.id, cs.dia_semana, cs.hora_inicio, cs.duracion_min, cs.profesor_id
  from inscripciones i
  join academias a on a.id = i.academia_id
  left join inscripcion_clase x on x.inscripcion_id = i.id
  left join clase_semanal cs on cs.id = x.clase_id and cs.activa
  where i.miembro_id = p_miembro and i.activa
  order by cs.dia_semana, cs.hora_inicio;
$$;

commit;
