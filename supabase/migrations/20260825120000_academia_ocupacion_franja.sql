-- Tablero de ocupación y asistencia POR FRANJA en un periodo.
--
-- Reemplaza a `academia_rendimiento_franja` (0057), que se fue con el modelo
-- viejo porque cruzaba las clases contra el horario del NIÑO. Ahora la clase
-- sabe de qué grupo es (`clases.grupo_id`, 0073), así que el cruce es exacto:
-- ya no hay que adivinar a qué franja pertenece una clase de la academia.
--
-- Va en SQL y no en JS por la regla de las 1.000 filas: un semestre de una
-- academia son ~200 clases × 8 niños = 1.600 asistencias, y PostgREST corta en
-- 1.000 sin avisar — el total saldría desinflado y nadie se enteraría.
--
-- 💡 Contesta DOS preguntas que antes se veían iguales:
--   · franja con inscritos y CERO clases dictadas → la clase no se dio (operativo)
--   · franja con clases y poca gente             → el grupo se vacía (negocio)
-- Devuelve los números crudos; quién es cuál lo etiqueta la pantalla.
-- ⚠️ DROP + CREATE, no solo CREATE OR REPLACE: agregar una columna de salida
-- cambia el tipo de retorno y Postgres lo rechaza ("cannot change return type").
drop function if exists public.academia_ocupacion_franja(bigint, date, date);

create function public.academia_ocupacion_franja(
  p_academia bigint default null,
  p_desde date default null,
  p_hasta date default null
)
returns table (
  academia_id bigint,
  grupo_id bigint,
  grupo_nombre text,
  nivel text,
  franja_id bigint,
  dia_semana smallint,
  hora_inicio time,
  hora_fin time,
  profesor_id uuid,
  cancha text,
  cupo smallint,
  inscritos integer,
  clases integer,
  clases_sin_cerrar integer,
  clases_por_venir integer,
  presentes integer,
  ausentes integer,
  excusas integer,
  reposiciones integer,
  desde_efectivo date
)
language sql
stable
set search_path = public
as $$
  with
  -- ⚠️ Desde CUÁNDO se le puede reprochar a una franja no haber tenido clase.
  -- No desde el inicio del periodo: desde que la academia empezó a registrar
  -- clases. Si su primera clase registrada es del 24 de agosto, que no haya
  -- ninguna el 3 de agosto no es un fallo del club — es que todavía no se
  -- estaba usando. Sin esto, el primer mes marca CADA franja en rojo y el
  -- tablero nace gritando, que es la mejor forma de que nadie lo mire.
  arranque as (
    select c.academia_id, min(c.fecha) as primera
    from clases c
    where c.tipo = 'academia' and c.estado in ('realizada', 'programada')
    group by c.academia_id
  ),
  franjas as (
    select g.academia_id, g.id as grupo_id, g.nombre as grupo_nombre, g.nivel::text as nivel,
           f.id as franja_id, f.dia_semana, f.hora_inicio, f.hora_fin,
           f.profesor_id, f.cancha,
           coalesce(f.cupo, cupo_nivel(g.nivel)) as cupo
    from academia_grupo g
    join grupo_franja f on f.grupo_id = g.id and f.activo
    where g.activo and (p_academia is null or g.academia_id = p_academia)
  ),
  -- Clases de academia del periodo. Tres estados que dicen cosas distintas:
  --   realizada ................... se dictó y se cerró
  --   programada con fecha pasada . se dictó y nadie la cerró (trámite)
  --   programada de hoy en adelante se registró y todavía no ocurre
  -- El tercero importa para no decir "no se registró nada" cuando sí se hizo.
  clases_periodo as (
    select c.id, c.academia_id, c.grupo_id, c.estado,
           extract(dow from c.fecha)::smallint as dow, c.hora_inicio, c.fecha
    from clases c
    where c.tipo = 'academia'
      and c.estado in ('realizada', 'programada')
      and (p_academia is null or c.academia_id = p_academia)
      and (p_desde is null or c.fecha >= p_desde)
      and (p_hasta is null or c.fecha <= p_hasta)
  ),
  -- Cada clase se pega a la franja MÁS CERCANA de su grupo ese día (±20 min).
  -- El "más cercana" evita que dos franjas vecinas cuenten la misma clase dos
  -- veces; el ±20 evita que una clase registrada 16:05 deje la franja de las
  -- 16:00 como "sin clases". Misma tolerancia en todo el módulo.
  clase_franja as (
    select c.id as clase_id, c.academia_id, c.grupo_id, c.estado, c.fecha,
           (
             select f.franja_id from franjas f
             where f.grupo_id = c.grupo_id and f.dia_semana = c.dow
               and abs(extract(epoch from (c.hora_inicio - f.hora_inicio))) <= 1200
             order by abs(extract(epoch from (c.hora_inicio - f.hora_inicio)))
             limit 1
           ) as franja_id
    from clases_periodo c
  ),
  conteo as (
    select cf.franja_id,
           count(*) filter (where cf.estado = 'realizada')::int as clases,
           count(*) filter (where cf.estado = 'programada' and cf.fecha < current_date)::int as sin_cerrar,
           count(*) filter (where cf.estado = 'programada' and cf.fecha >= current_date)::int as por_venir
    from clase_franja cf where cf.franja_id is not null group by cf.franja_id
  ),
  asis as (
    select cf.franja_id,
           count(*) filter (where a.estado = 'presente')::int as presentes,
           count(*) filter (where a.estado = 'ausente')::int as ausentes,
           count(*) filter (where a.estado = 'excusa_medica')::int as excusas,
           count(*) filter (where a.estado = 'reposicion')::int as reposiciones
    from clase_franja cf
    join asistencias a on a.clase_id = cf.clase_id
    where cf.franja_id is not null group by cf.franja_id
  ),
  ocupacion as (
    select x.franja_id, count(*)::int as inscritos
    from inscripcion_franja x
    join inscripciones i on i.id = x.inscripcion_id and i.activa
    group by x.franja_id
  )
  select f.academia_id, f.grupo_id, f.grupo_nombre, f.nivel,
         f.franja_id, f.dia_semana, f.hora_inicio, f.hora_fin, f.profesor_id, f.cancha,
         f.cupo::smallint,
         coalesce(o.inscritos, 0),
         coalesce(c.clases, 0), coalesce(c.sin_cerrar, 0), coalesce(c.por_venir, 0),
         coalesce(a.presentes, 0), coalesce(a.ausentes, 0),
         coalesce(a.excusas, 0), coalesce(a.reposiciones, 0),
         greatest(ar.primera, p_desde)
  from franjas f
  left join ocupacion o on o.franja_id = f.franja_id
  left join conteo c on c.franja_id = f.franja_id
  left join asis a on a.franja_id = f.franja_id
  left join arranque ar on ar.academia_id = f.academia_id

  union all

  -- "Otras horas": clases dictadas a una hora que ninguna franja del grupo
  -- tiene. No se esconden — son reposiciones, clases extra o una franja mal
  -- configurada, y las tres cosas hay que poder verlas.
  -- ⚠️ `count(distinct clase_id)`, no `count(*)`: aquí se une con asistencias en
  -- la misma consulta, así que una clase aparece una vez POR ASISTENTE. Medido:
  -- una clase con 2 presentes se contaba como 2 clases.
  select cf.academia_id, cf.grupo_id,
         coalesce(g.nombre, 'Sin grupo'), coalesce(g.nivel::text, ''),
         null::bigint, null::smallint, null::time, null::time, null::uuid, null::text,
         null::smallint, 0,
         count(distinct cf.clase_id) filter (where cf.estado = 'realizada')::int,
         count(distinct cf.clase_id) filter (where cf.estado = 'programada' and cf.fecha < current_date)::int,
         count(distinct cf.clase_id) filter (where cf.estado = 'programada' and cf.fecha >= current_date)::int,
         count(a.id) filter (where a.estado = 'presente')::int,
         count(a.id) filter (where a.estado = 'ausente')::int,
         count(a.id) filter (where a.estado = 'excusa_medica')::int,
         count(a.id) filter (where a.estado = 'reposicion')::int,
         null::date
  from clase_franja cf
  left join academia_grupo g on g.id = cf.grupo_id
  left join asistencias a on a.clase_id = cf.clase_id
  where cf.franja_id is null
  group by cf.academia_id, cf.grupo_id, g.nombre, g.nivel

  order by 3, 6 nulls last, 7 nulls last;
$$;

comment on function public.academia_ocupacion_franja is
  'Ocupación y asistencia por franja en un periodo. franja_id null = clases a una hora que ninguna franja cubre ("Otras horas"). desde_efectivo = desde cuándo se le puede exigir clase a esa franja (null si la academia nunca ha registrado ninguna). Números crudos: la pantalla decide qué es riesgo.';

grant execute on function public.academia_ocupacion_franja(bigint, date, date) to authenticated;
