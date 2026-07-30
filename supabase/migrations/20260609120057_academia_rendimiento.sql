-- Rendimiento de una academia: ¿qué franjas funcionan y cuáles se están vaciando?
--
-- La pregunta del club ("qué días no están teniendo asistencia") son en realidad
-- DOS problemas distintos que antes se veían iguales, y solo se pueden separar
-- porque ahora existen los horarios por inscrito:
--   · franja con inscritos y CERO clases dictadas  → la clase no se dio (operativo)
--   · franja con clases dictadas y poca asistencia → el grupo se muere (negocio)
--
-- La agregación va en SQL, no en JS: un semestre de una academia son ~200 clases
-- × ~8 niños = 1.600 asistencias, y PostgREST corta en 1.000 filas sin avisar.
--
-- OJO: no se toca `profiles` aquí. Los nombres de profesor se resuelven en el
-- servidor con los helpers de staff.ts, porque `profiles_select` solo deja ver el
-- propio perfil y a recepción le saldrían vacíos.

-- ───────── Por franja (el "grupo" como cálculo, nunca como entidad) ─────────
create or replace function public.academia_rendimiento_franja(
  p_academia bigint,
  p_desde date,
  p_hasta date
)
returns table (
  dia_semana smallint,
  hora_inicio time,
  hora_fin time,
  inscritos integer,
  clases_cerradas integer,
  clases_sin_cerrar integer,
  presentes integer,
  ausentes integer,
  excusas integer,
  reposiciones integer
)
language sql
stable
set search_path = public
as $$
  with franjas as (
    select h.dia_semana, h.hora_inicio, h.hora_fin, count(*)::int as inscritos
    from inscripcion_horarios h
    join inscripciones i on i.id = h.inscripcion_id
    where i.academia_id = p_academia and i.activa
    group by h.dia_semana, h.hora_inicio, h.hora_fin
  ),
  dictadas as (
    select c.id, c.estado, c.hora_inicio, extract(dow from c.fecha)::smallint as dow
    from clases c
    where c.academia_id = p_academia
      and c.tipo = 'academia'
      and c.fecha between p_desde and p_hasta
      and c.estado <> 'cancelada'
  ),
  -- Cada clase se pega a la franja MÁS CERCANA de su mismo día (±20 min). La
  -- tolerancia es para que una clase registrada 16:05 no deje la franja de las
  -- 16:00 reportada como "sin clases"; el "más cercana" evita que dos franjas
  -- vecinas se roben la misma clase y la cuenten dos veces.
  emparejadas as (
    select d.id, d.estado, f.dia_semana as f_dia, f.hora_inicio as f_ini, f.hora_fin as f_fin
    from dictadas d
    left join lateral (
      select fr.dia_semana, fr.hora_inicio, fr.hora_fin
      from franjas fr
      where fr.dia_semana = d.dow
        and abs(extract(epoch from (d.hora_inicio - fr.hora_inicio))) <= 1200
      order by abs(extract(epoch from (d.hora_inicio - fr.hora_inicio)))
      limit 1
    ) f on true
  ),
  conteo_clases as (
    select f_dia, f_ini, f_fin,
           count(*) filter (where estado = 'realizada')::int  as cerradas,
           count(*) filter (where estado <> 'realizada')::int  as sin_cerrar
    from emparejadas
    group by f_dia, f_ini, f_fin
  ),
  conteo_asis as (
    select e.f_dia, e.f_ini, e.f_fin,
           count(*) filter (where a.estado = 'presente')::int      as presentes,
           count(*) filter (where a.estado = 'ausente')::int       as ausentes,
           count(*) filter (where a.estado = 'excusa_medica')::int as excusas,
           count(*) filter (where a.estado = 'reposicion')::int    as reposiciones
    from emparejadas e
    join asistencias a on a.clase_id = e.id
    group by e.f_dia, e.f_ini, e.f_fin
  )
  -- 1) Todas las franjas, tengan o no clases: la franja sin clases ES el hallazgo.
  select f.dia_semana, f.hora_inicio, f.hora_fin, f.inscritos,
         coalesce(c.cerradas, 0), coalesce(c.sin_cerrar, 0),
         coalesce(a.presentes, 0), coalesce(a.ausentes, 0),
         coalesce(a.excusas, 0), coalesce(a.reposiciones, 0)
  from franjas f
  left join conteo_clases c
    on c.f_dia = f.dia_semana and c.f_ini = f.hora_inicio and c.f_fin = f.hora_fin
  left join conteo_asis a
    on a.f_dia = f.dia_semana and a.f_ini = f.hora_inicio and a.f_fin = f.hora_fin

  union all

  -- 2) Clases que no cayeron en ninguna franja (hora que nadie tiene inscrita).
  --    Salen con la franja en null para que la UI las muestre como "fuera de franja".
  select null::smallint, null::time, null::time, 0,
         c.cerradas, c.sin_cerrar,
         coalesce(a.presentes, 0), coalesce(a.ausentes, 0),
         coalesce(a.excusas, 0), coalesce(a.reposiciones, 0)
  from conteo_clases c
  left join conteo_asis a on a.f_dia is null and a.f_ini is null
  where c.f_ini is null

  order by 1 nulls last, 2;
$$;

comment on function public.academia_rendimiento_franja is
  'Una fila por franja (día+hora) de la academia: inscritos esperados vs clases dictadas y asistencia real. La última fila, con franja nula, son las clases dictadas a una hora que nadie tiene inscrita.';

-- ───────── Clases dictadas en el periodo, con su asistencia ─────────
create or replace function public.academia_clases_periodo(
  p_academia bigint,
  p_desde date,
  p_hasta date
)
returns table (
  clase_id bigint,
  fecha date,
  hora_inicio time,
  hora_fin time,
  estado text,
  profesor_id uuid,
  cancha text,
  presentes integer,
  ausentes integer,
  excusas integer,
  reposiciones integer,
  esperados integer
)
language sql
stable
set search_path = public
as $$
  select c.id, c.fecha, c.hora_inicio, c.hora_fin, c.estado::text, c.profesor_id, c.cancha,
         count(a.id) filter (where a.estado = 'presente')::int      as presentes,
         count(a.id) filter (where a.estado = 'ausente')::int       as ausentes,
         count(a.id) filter (where a.estado = 'excusa_medica')::int as excusas,
         count(a.id) filter (where a.estado = 'reposicion')::int    as reposiciones,
         -- Cuántos niños tenían ESA hora de ESE día en su horario.
         (
           select count(*)::int
           from inscripcion_horarios h
           join inscripciones i on i.id = h.inscripcion_id
           where i.academia_id = p_academia
             and i.activa
             and h.dia_semana = extract(dow from c.fecha)::smallint
             and abs(extract(epoch from (c.hora_inicio - h.hora_inicio))) <= 1200
         ) as esperados
  from clases c
  left join asistencias a on a.clase_id = c.id
  where c.academia_id = p_academia
    and c.tipo = 'academia'
    and c.fecha between p_desde and p_hasta
    and c.estado <> 'cancelada'
  group by c.id, c.fecha, c.hora_inicio, c.hora_fin, c.estado, c.profesor_id, c.cancha
  order by c.fecha desc, c.hora_inicio;
$$;

comment on function public.academia_clases_periodo is
  'Una fila por clase dictada de la academia en el periodo, con su asistencia y cuántos niños se esperaban a esa hora.';

-- ───────── Quiénes asistieron a UNA clase (se pide al desplegarla) ─────────
create or replace function public.academia_asistencia_clase(p_clase bigint)
returns table (
  miembro_id bigint,
  nombre text,
  estado text,
  esperado boolean
)
language sql
stable
set search_path = public
as $$
  with clase as (
    select c.id, c.academia_id, c.hora_inicio, extract(dow from c.fecha)::smallint as dow
    from clases c where c.id = p_clase
  ),
  -- Se esperaba a quien tiene ESA hora de ESE día en su horario.
  esperados as (
    select i.miembro_id
    from inscripcion_horarios h
    join inscripciones i on i.id = h.inscripcion_id
    join clase cl on cl.academia_id = i.academia_id
    where i.activa
      and h.dia_semana = cl.dow
      and abs(extract(epoch from (cl.hora_inicio - h.hora_inicio))) <= 1200
  )
  select m.id, m.apellidos || ', ' || m.nombres, a.estado::text,
         exists (select 1 from esperados e where e.miembro_id = m.id)
  from asistencias a
  join cliente_miembros m on m.id = a.miembro_id
  where a.clase_id = p_clase
  order by 2;
$$;

comment on function public.academia_asistencia_clase is
  'Quiénes quedaron registrados en una clase de academia y si se les esperaba a esa hora (para distinguir una reposición).';
