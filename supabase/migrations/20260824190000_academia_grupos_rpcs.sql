-- Lo que la pantalla de academias necesita saber, agregado en SQL.
--
-- Va en RPCs y no en JS por la regla de las 1.000 filas: hoy son 9 grupos y 64
-- franjas, pero el enlace niño↔franja crece con cada inscrito y PostgREST corta
-- sin avisar. Además evita el N+1 de pedir las franjas grupo por grupo.
--
-- Ninguno toca `profiles` (regla 9): devuelven `profesor_id` y el nombre se
-- resuelve con los helpers de staff.ts.

/** Cupo efectivo de una franja: el suyo propio, o el del nivel de su grupo. */
create or replace function public.franja_cupo(p_franja bigint)
returns integer
language sql
stable
set search_path = public
as $$
  select coalesce(f.cupo, public.cupo_nivel(g.nivel))::int
  from grupo_franja f join academia_grupo g on g.id = f.grupo_id
  where f.id = p_franja;
$$;

-- ───────── Resumen por grupo (lista de academias y ficha de academia) ─────────
create or replace function public.academia_grupos_resumen(p_academia bigint default null)
returns table (
  grupo_id bigint,
  academia_id bigint,
  nombre text,
  nivel text,
  edad_min smallint,
  edad_max smallint,
  activo boolean,
  franjas integer,
  ninos integer,
  cupo_total integer,
  ocupados integer,
  franjas_sobre_cupo integer,
  dias smallint[]
)
language sql
stable
set search_path = public
as $$
  with f as (
    select fr.id, fr.grupo_id, fr.dia_semana,
           coalesce(fr.cupo, public.cupo_nivel(g.nivel))::int as cupo,
           (select count(*) from inscripcion_franja x where x.franja_id = fr.id)::int as usados
    from grupo_franja fr
    join academia_grupo g on g.id = fr.grupo_id
    where fr.activo
  )
  select g.id, g.academia_id, g.nombre, g.nivel::text, g.edad_min, g.edad_max, g.activo,
         coalesce((select count(*)::int from f where f.grupo_id = g.id), 0),
         (select count(*)::int from inscripciones i where i.grupo_id = g.id and i.activa),
         coalesce((select sum(f.cupo)::int from f where f.grupo_id = g.id), 0),
         coalesce((select sum(f.usados)::int from f where f.grupo_id = g.id), 0),
         coalesce((select count(*)::int from f where f.grupo_id = g.id and f.usados > f.cupo), 0),
         coalesce((select array_agg(distinct f.dia_semana order by f.dia_semana) from f where f.grupo_id = g.id), '{}')
  from academia_grupo g
  where p_academia is null or g.academia_id = p_academia
  order by g.nivel, g.edad_min, g.nombre;
$$;

comment on function public.academia_grupos_resumen is
  'Una fila por grupo con sus franjas, inscritos, cupo total y cuántas franjas van por encima del tope. p_academia null = todas.';

-- ───────── Franjas de un grupo, con su ocupación ─────────
create or replace function public.grupo_franjas(p_grupo bigint)
returns table (
  franja_id bigint,
  dia_semana smallint,
  hora_inicio time,
  hora_fin time,
  profesor_id uuid,
  cancha text,
  cupo integer,
  inscritos integer
)
language sql
stable
set search_path = public
as $$
  select fr.id, fr.dia_semana, fr.hora_inicio, fr.hora_fin, fr.profesor_id, fr.cancha,
         coalesce(fr.cupo, public.cupo_nivel(g.nivel))::int,
         (select count(*)::int from inscripcion_franja x where x.franja_id = fr.id)
  from grupo_franja fr
  join academia_grupo g on g.id = fr.grupo_id
  where fr.grupo_id = p_grupo and fr.activo
  order by fr.dia_semana, fr.hora_inicio;
$$;

-- ───────── Inscritos de un grupo, con edad, días y asistencia ─────────
create or replace function public.grupo_inscritos(
  p_grupo bigint,
  p_desde date default null,
  p_hasta date default null
)
returns table (
  inscripcion_id bigint,
  miembro_id bigint,
  cliente_id bigint,
  nombre text,
  edad integer,
  fuera_de_rango boolean,
  franjas smallint[],
  horas text[],
  esperadas integer,
  presentes integer,
  excusas integer
)
language sql
stable
set search_path = public
as $$
  with g as (select * from academia_grupo where id = p_grupo),
  ins as (
    select i.id, i.miembro_id, i.cliente_id,
           m.apellidos || ', ' || m.nombres as nombre,
           extract(year from age(m.fecha_nacimiento))::int as edad
    from inscripciones i
    join cliente_miembros m on m.id = i.miembro_id
    where i.grupo_id = p_grupo and i.activa and m.activo
  ),
  -- Clases cerradas del periodo en la academia del grupo.
  dictadas as (
    select c.id, c.hora_inicio, extract(dow from c.fecha)::smallint as dow
    from clases c
    join g on g.academia_id = c.academia_id
    where c.tipo = 'academia' and c.estado = 'realizada'
      and (p_desde is null or c.fecha >= p_desde)
      and (p_hasta is null or c.fecha <= p_hasta)
  )
  select i.id, i.miembro_id, i.cliente_id, i.nombre, i.edad,
         (i.edad < (select edad_min from g) or i.edad > (select edad_max from g)),
         coalesce((select array_agg(fr.dia_semana order by fr.dia_semana, fr.hora_inicio)
                   from inscripcion_franja x join grupo_franja fr on fr.id = x.franja_id
                   where x.inscripcion_id = i.id), '{}'),
         coalesce((select array_agg(to_char(fr.hora_inicio,'HH24:MI') order by fr.dia_semana, fr.hora_inicio)
                   from inscripcion_franja x join grupo_franja fr on fr.id = x.franja_id
                   where x.inscripcion_id = i.id), '{}'),
         -- Esperadas: clases dictadas que caen en SUS franjas (±20 min).
         (select count(distinct d.id)::int
          from inscripcion_franja x
          join grupo_franja fr on fr.id = x.franja_id
          join dictadas d on d.dow = fr.dia_semana
                         and abs(extract(epoch from (d.hora_inicio - fr.hora_inicio))) <= 1200
          where x.inscripcion_id = i.id),
         (select count(*)::int from asistencias a join dictadas d on d.id = a.clase_id
          where a.miembro_id = i.miembro_id and a.estado = 'presente'),
         (select count(*)::int from asistencias a join dictadas d on d.id = a.clase_id
          where a.miembro_id = i.miembro_id and a.estado = 'excusa_medica')
  from ins i
  order by i.nombre;
$$;

comment on function public.grupo_inscritos is
  'Inscritos de un grupo con su edad, si queda fuera del rango, a qué franjas va y su asistencia del periodo.';
