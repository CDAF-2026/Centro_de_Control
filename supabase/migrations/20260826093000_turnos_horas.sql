-- ============================================================================
-- 0081 · Clasificación de horas según la normativa laboral colombiana
-- ----------------------------------------------------------------------------
-- Convierte los turnos marcados en las categorías con las que se paga la nómina:
--
--   Diurnas · Nocturnas (35%) · Extra diurnas (25%) · Extra nocturnas (75%)
--   y esas mismas cuatro en domingo o festivo (+90%).
--
-- Reglas acordadas con Laura (25-ago-2026), verificadas contra la norma vigente:
--   · Semana de LUNES a DOMINGO. Máximo 42 h (Ley 2101 de 2021, desde el
--     15-jul-2026). Jornada diaria de 7 h trabajadas más 1 de almuerzo.
--   · Diurna 6:00 a.m.–6:59 p.m. · Nocturna 7:00 p.m.–5:59 a.m. (Ley 2466 de
--     2025, que corrió el inicio de la noche de las 9 a las 7 p.m.).
--     ⚠️ El club abre a las 7 a.m., pero la franja arranca a las 6 porque eso es
--     lo que dice la ley: el día que alguien abra a las 6:30 esa media hora
--     queda bien contada como diurna.
--   · Una hora es EXTRA si pasa cualquiera de tres cosas: supera las 7 h del
--     día, supera las 42 de la semana, o cae fuera de la ventana de operación
--     del club (después de las 9 p.m. y antes de las 6 a.m.).
--   · Domingos y los 18 festivos llevan recargo dominical; los dos recargos se
--     acumulan si además es de noche.
--
-- 🧮 SE CUENTA MINUTO A MINUTO, a propósito. Con fórmulas de "restar horas"
-- habría que resolver a mano el turno que cruza las 7 p.m., el que cruza la
-- medianoche del domingo al lunes y —el peor— el instante exacto en que se
-- cumplen las 42 h de la semana a mitad de hora. Marcando cada minuto por
-- separado eso sale solo. El volumen es ridículo para Postgres: una quincena de
-- cuatro personas son unos 20.000 minutos.
--
-- ⚠️ El tope DIARIO se cuenta por día calendario. Si algún día hay turnos que
-- crucen la medianoche de verdad, hay que revisarlo; hoy da igual, porque toda
-- hora después de las 9 p.m. ya entra como extra por la tercera regla.
--
-- ⚠️ La función NO es SECURITY DEFINER, y es deliberado: así la RLS de `turno`
-- hace el filtro sola (cada quien ve lo suyo, el superadministrador ve todo) y
-- no hay un guardia escrito a mano que se pueda quedar desactualizado.
-- ============================================================================

/**
 * Minutos trabajados por persona y por DÍA, ya clasificados.
 *
 * Se devuelve por día —y no por semana— para que el reporte pueda sumar
 * cualquier periodo (quincena, mes) sin recalcular: la clasificación de cada
 * minuto ya tuvo en cuenta la semana completa a la que pertenece.
 *
 * ⚠️ El acumulado de 42 h se cuenta desde el LUNES de cada semana tocada por el
 * periodo, aunque `p_desde` caiga a mitad de semana. Sin eso, pedir "del 12 al
 * 20" reiniciaría el contador el 12 y las extras saldrían de menos.
 *
 * Los turnos abiertos (sin salida) aportan CERO: no se inventa la hora de
 * salida. Salen aparte, en rojo, por `turnos_listar`.
 */
create or replace function public.turnos_horas(
  p_desde  date,
  p_hasta  date,
  p_perfil uuid default null
)
returns table (
  perfil_id           uuid,
  dia                 date,
  semana              date,
  diurnas             int,
  nocturnas           int,
  extra_diurnas       int,
  extra_nocturnas     int,
  dom_diurnas         int,
  dom_nocturnas       int,
  dom_extra_diurnas   int,
  dom_extra_nocturnas int,
  total               int
)
language sql
stable
set search_path = ''
as $$
  with param as (
    select 6     as inicia_diurna,    -- 6:00 a.m.
           19    as inicia_nocturna,  -- 7:00 p.m.
           21    as cierra_club,      -- 9:00 p.m.: después de esta hora, todo es extra
           7  * 60 as jornada_min,    -- 7 h trabajadas al día
           42 * 60 as semana_min      -- 42 h a la semana
  ),
  -- Semanas COMPLETAS que toca el periodo pedido (date_trunc('week') = lunes).
  rango as (
    select date_trunc('week', p_desde::timestamp)::date as desde,
           (date_trunc('week', p_hasta::timestamp) + interval '6 days')::date as hasta
  ),
  turnos as (
    select t.id, t.perfil_id, t.inicio_el, t.fin_el
      from public.turno t, rango r
     where t.fin_el is not null
       and (p_perfil is null or t.perfil_id = p_perfil)
       and (t.inicio_el at time zone 'America/Bogota')::date <= r.hasta
       and (t.fin_el    at time zone 'America/Bogota')::date >= r.desde
  ),
  -- Un renglón por minuto trabajado, ya descontado el almuerzo.
  minutos as (
    select t.perfil_id, gs.minuto
      from turnos t
      cross join lateral generate_series(
        t.inicio_el, t.fin_el - interval '1 minute', interval '1 minute'
      ) as gs(minuto)
     where not exists (
       select 1 from public.turno_pausa p
        where p.turno_id = t.id
          and p.fin_el is not null
          and gs.minuto >= p.inicio_el
          and gs.minuto <  p.fin_el
     )
  ),
  ubicado as (
    select m.perfil_id,
           m.minuto,
           (m.minuto at time zone 'America/Bogota') as local
      from minutos m
  ),
  marcado as (
    select u.perfil_id,
           u.minuto,
           u.local::date                        as dia,
           date_trunc('week', u.local)::date    as semana,
           extract(hour from u.local)::int      as hora,
           (extract(isodow from u.local) = 7
            or exists (select 1 from public.festivo f where f.fecha = u.local::date)) as dominical
      from ubicado u
  ),
  -- El orden dentro del día y dentro de la semana es lo que decide qué minuto
  -- pasó del tope: el minuto 421 del día, o el 2.521 de la semana.
  contado as (
    select mk.*,
           row_number() over (partition by mk.perfil_id, mk.dia    order by mk.minuto) as n_dia,
           row_number() over (partition by mk.perfil_id, mk.semana order by mk.minuto) as n_semana
      from marcado mk
  ),
  clasificado as (
    select c.perfil_id,
           c.dia,
           c.semana,
           c.dominical,
           (c.hora >= p.inicia_nocturna or c.hora < p.inicia_diurna) as nocturna,
           (c.n_dia    > p.jornada_min
            or c.n_semana > p.semana_min
            or c.hora >= p.cierra_club
            or c.hora <  p.inicia_diurna)                            as extra
      from contado c, param p
  )
  select perfil_id,
         dia,
         semana,
         count(*) filter (where not dominical and not nocturna and not extra)::int,
         count(*) filter (where not dominical and     nocturna and not extra)::int,
         count(*) filter (where not dominical and not nocturna and     extra)::int,
         count(*) filter (where not dominical and     nocturna and     extra)::int,
         count(*) filter (where     dominical and not nocturna and not extra)::int,
         count(*) filter (where     dominical and     nocturna and not extra)::int,
         count(*) filter (where     dominical and not nocturna and     extra)::int,
         count(*) filter (where     dominical and     nocturna and     extra)::int,
         count(*)::int
    from clasificado
   where dia between p_desde and p_hasta
   group by perfil_id, dia, semana
   order by perfil_id, dia;
$$;

comment on function public.turnos_horas(date, date, uuid) is
  'Minutos trabajados por persona y día, clasificados según la normativa (diurna/nocturna/extra/dominical). El tope de 42 h se cuenta sobre la semana completa.';

grant execute on function public.turnos_horas(date, date, uuid) to authenticated;

/**
 * Detalle turno por turno, para el reporte y para la pantalla del empleado.
 *
 * Devuelve hechos, no juicios: los avisos (turno sin cerrar, sin foto, turno
 * largo sin almuerzo registrado) los arma la pantalla con estos datos, para que
 * cambiar un umbral no obligue a tocar la base.
 */
create or replace function public.turnos_listar(
  p_desde  date,
  p_hasta  date,
  p_perfil uuid default null
)
returns table (
  id               bigint,
  perfil_id        uuid,
  dia              date,
  inicio_el        timestamptz,
  fin_el           timestamptz,
  minutos          int,
  minutos_pausa    int,
  n_pausas         int,
  pausa_abierta    boolean,
  foto_inicio_path text,
  foto_fin_path    text,
  origen           text,
  ajustado_por     uuid,
  ajuste_motivo    text
)
language sql
stable
set search_path = ''
as $$
  with pausa as (
    select p.turno_id,
           coalesce(sum(
             extract(epoch from (p.fin_el - p.inicio_el)) / 60
           ) filter (where p.fin_el is not null), 0)::int as minutos,
           count(*)::int                                  as n,
           bool_or(p.fin_el is null)                      as abierta
      from public.turno_pausa p
     group by p.turno_id
  )
  select t.id,
         t.perfil_id,
         (t.inicio_el at time zone 'America/Bogota')::date,
         t.inicio_el,
         t.fin_el,
         case when t.fin_el is null then null
              else (extract(epoch from (t.fin_el - t.inicio_el)) / 60)::int
                   - coalesce(pa.minutos, 0)
         end,
         coalesce(pa.minutos, 0),
         coalesce(pa.n, 0),
         coalesce(pa.abierta, false),
         t.foto_inicio_path,
         t.foto_fin_path,
         t.origen,
         t.ajustado_por,
         t.ajuste_motivo
    from public.turno t
    left join pausa pa on pa.turno_id = t.id
   where (p_perfil is null or t.perfil_id = p_perfil)
     and (t.inicio_el at time zone 'America/Bogota')::date between p_desde and p_hasta
   order by t.inicio_el desc;
$$;

comment on function public.turnos_listar(date, date, uuid) is
  'Turnos del periodo con sus minutos ya descontado el almuerzo. `minutos` null = turno todavía abierto.';

grant execute on function public.turnos_listar(date, date, uuid) to authenticated;
