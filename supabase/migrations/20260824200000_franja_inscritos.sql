-- Los inscritos vistos POR FRANJA, no como una lista plana del grupo.
--
-- La franja es la clase que de verdad ocurre, así que la pregunta operativa es
-- "¿quién viene el martes a las 15:30?". En una lista plana del grupo eso hay que
-- cruzarlo a ojo con la columna de días.
--
-- Y permite medir la asistencia DONDE importa: por franja. Un niño que va martes
-- y jueves puede estar fallando solo los jueves, y un promedio del grupo lo
-- esconde. Aquí "esperadas" son las clases dictadas de ESA franja.
--
-- Devuelve también a los inscritos SIN franja asignada (franja_id null): existen
-- —una inscripción a la que nadie le puso días— y en una vista por franja
-- desaparecerían sin dejar rastro.
create or replace function public.grupo_inscritos_por_franja(
  p_grupo bigint,
  p_desde date default null,
  p_hasta date default null
)
returns table (
  franja_id bigint,
  inscripcion_id bigint,
  miembro_id bigint,
  cliente_id bigint,
  nombre text,
  edad integer,
  fuera_de_rango boolean,
  esperadas integer,
  presentes integer,
  ausentes integer,
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
  dictadas as (
    select c.id, c.hora_inicio, extract(dow from c.fecha)::smallint as dow
    from clases c join g on g.academia_id = c.academia_id
    where c.tipo = 'academia' and c.estado = 'realizada'
      and (p_desde is null or c.fecha >= p_desde)
      and (p_hasta is null or c.fecha <= p_hasta)
  ),
  -- Clases dictadas que caen en cada franja (±20 min, igual que el resto).
  clases_franja as (
    select fr.id as franja_id, d.id as clase_id
    from grupo_franja fr
    join dictadas d on d.dow = fr.dia_semana
                   and abs(extract(epoch from (d.hora_inicio - fr.hora_inicio))) <= 1200
    where fr.grupo_id = p_grupo
  )
  select x.franja_id, i.id, i.miembro_id, i.cliente_id, i.nombre, i.edad,
         (i.edad < (select edad_min from g) or i.edad > (select edad_max from g)),
         (select count(*)::int from clases_franja cf where cf.franja_id = x.franja_id),
         (select count(*)::int from asistencias a join clases_franja cf on cf.clase_id = a.clase_id
          where cf.franja_id = x.franja_id and a.miembro_id = i.miembro_id and a.estado = 'presente'),
         (select count(*)::int from asistencias a join clases_franja cf on cf.clase_id = a.clase_id
          where cf.franja_id = x.franja_id and a.miembro_id = i.miembro_id and a.estado = 'ausente'),
         (select count(*)::int from asistencias a join clases_franja cf on cf.clase_id = a.clase_id
          where cf.franja_id = x.franja_id and a.miembro_id = i.miembro_id and a.estado = 'excusa_medica')
  from ins i
  join inscripcion_franja x on x.inscripcion_id = i.id

  union all

  -- Inscritos a los que nadie les puso franja: se muestran aparte, no se pierden.
  select null::bigint, i.id, i.miembro_id, i.cliente_id, i.nombre, i.edad,
         (i.edad < (select edad_min from g) or i.edad > (select edad_max from g)),
         0, 0, 0, 0
  from ins i
  where not exists (select 1 from inscripcion_franja x where x.inscripcion_id = i.id)

  order by 1 nulls last, 5;
$$;

comment on function public.grupo_inscritos_por_franja is
  'Una fila por (franja, niño) con su asistencia EN ESA franja. franja_id null = inscrito sin franja asignada.';
