-- Rendimiento por NIÑO: quién se está desenganchando.
--
-- El "esperadas" NO son las semanas del calendario: son las clases que de verdad
-- se dictaron en las franjas de ESE niño. No se le puede reprochar a un niño no
-- haber asistido a una clase que nunca se dio — ese es un problema del club, y ya
-- sale en el tablero por franja.
--
-- Agregado en SQL por la regla de las 1.000 filas: un semestre de una academia son
-- ~200 clases × ~8 niños = 1.600 asistencias.
--
-- No toca `profiles` (regla 9): aquí no hace falta el profesor.
create or replace function public.academia_rendimiento_nino(
  p_academia bigint,
  p_desde date,
  p_hasta date
)
returns table (
  miembro_id bigint,
  nombre text,
  nivel text,
  horarios integer,
  esperadas integer,
  presentes integer,
  ausentes integer,
  excusas integer,
  reposiciones integer
)
language sql
stable
set search_path = public
as $$
  with inscritos as (
    select i.id as insc, i.miembro_id, i.nivel,
           m.apellidos || ', ' || m.nombres as nombre,
           (select count(*)::int from inscripcion_horarios h where h.inscripcion_id = i.id) as horarios
    from inscripciones i
    join cliente_miembros m on m.id = i.miembro_id
    where i.academia_id = p_academia and i.activa and m.activo
  ),
  dictadas as (
    select c.id, c.hora_inicio, extract(dow from c.fecha)::smallint as dow
    from clases c
    where c.academia_id = p_academia
      and c.tipo = 'academia'
      and c.fecha between p_desde and p_hasta
      and c.estado = 'realizada'          -- solo las cerradas: las demás no se pueden juzgar
  ),
  -- Clases que caían en la franja de cada niño (±20 min, igual que el resto).
  esperadas_por_nino as (
    select ins.insc, count(distinct d.id)::int as n
    from inscritos ins
    join inscripcion_horarios h on h.inscripcion_id = ins.insc
    join dictadas d
      on d.dow = h.dia_semana
     and abs(extract(epoch from (d.hora_inicio - h.hora_inicio))) <= 1200
    group by ins.insc
  ),
  asis as (
    select a.miembro_id,
           count(*) filter (where a.estado = 'presente')::int      as presentes,
           count(*) filter (where a.estado = 'ausente')::int       as ausentes,
           count(*) filter (where a.estado = 'excusa_medica')::int as excusas,
           count(*) filter (where a.estado = 'reposicion')::int    as reposiciones
    from asistencias a
    join dictadas d on d.id = a.clase_id
    group by a.miembro_id
  )
  select ins.miembro_id, ins.nombre, ins.nivel, ins.horarios,
         coalesce(e.n, 0),
         coalesce(a.presentes, 0), coalesce(a.ausentes, 0),
         coalesce(a.excusas, 0), coalesce(a.reposiciones, 0)
  from inscritos ins
  left join esperadas_por_nino e on e.insc = ins.insc
  left join asis a on a.miembro_id = ins.miembro_id
  order by ins.nombre;
$$;

comment on function public.academia_rendimiento_nino is
  'Una fila por inscrito: cuántas clases de SUS franjas se dictaron en el periodo y a cuántas asistió.';
