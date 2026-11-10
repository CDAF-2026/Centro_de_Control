-- ============================================================================
-- Turnos · hacia las 42 h semanales solo suman las horas ORDINARIAS
-- ----------------------------------------------------------------------------
-- Decisión de Laura, 10-nov-2026, al documentar el módulo para otro cliente.
--
-- QUÉ PASABA. `turnos_horas` (0081) decidía "extra" con una sola condición:
-- pasar de 7 h en el día, O pasar de 42 en la semana, O caer fuera de la
-- ventana del club. El contador de la semana (`n_semana`) numeraba TODOS los
-- minutos trabajados, también los que ya eran extra por el día. O sea que la
-- misma hora se contaba dos veces: se pagaba como extra el día que ocurría y
-- además gastaba cupo de las 42, así que al final de la semana se volvían extra
-- horas que eran ordinarias.
--
--   Lunes a sábado, 8 h diarias (48 h):   antes 37 ordinarias + 11 extra
--                                         ahora 42 ordinarias +  6 extra
--   Vigilante, 11 h diarias × 6 (66 h):   antes 28 ordinarias + 38 extra
--                                         ahora 42 ordinarias + 24 extra
--
-- El segundo renglón es justo lo que MEMORIA.md decía que debía dar ("4 extras
-- al día, 24 a la semana"): la regla acordada era esta, lo torcido era el conteo.
--
-- Medido sobre los turnos reales antes de aplicar (27-ago a 10-nov-2026, 219
-- turnos): 142 horas extra de más entre cinco personas, en 23 semanas-persona.
-- A quien hace sus 7 h normales no le cambia nada.
--
-- QUÉ CAMBIA. Dos pasos en vez de uno:
--   1. por el DÍA: extra si pasa de 7 h, o es después de las 9 p.m., o antes de
--      las 6 a.m. (igual que antes);
--   2. por la SEMANA: de los minutos que NO son extra por el día, es extra el
--      que pase del minuto 2.520. El acumulado avanza solo con ordinarios.
--
-- ⚠️ SE APLICA HACIA ATRÁS, y es decisión de Laura (se le ofreció empezar el
-- 2-nov o el 16-nov y escogió "todo"). La función calcula al vuelo, así que
-- los reportes de agosto a octubre muestran desde hoy MENOS extras que cuando
-- se consultaron. Si alguien compara un Excel viejo con la pantalla y no
-- cuadra, es por esto.
--
-- ⚠️ No se descartó "contar solo al final de la semana": dejaría sin pagar el
-- día largo que se compensa con uno corto (lunes de 10 h en una semana de 42
-- daría 0 extras), y la ley pone los dos topes, el diario y el semanal.
--
-- Misma firma y misma salida: basta `create or replace`, sin DROP. Sigue siendo
-- SECURITY INVOKER a propósito (la RLS de `turno` filtra sola).
-- ============================================================================

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
           42 * 60 as semana_min      -- 42 h ORDINARIAS a la semana
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
  -- Paso 1 · el orden dentro del DÍA decide qué minuto pasó de la jornada.
  contado as (
    select mk.*,
           row_number() over (partition by mk.perfil_id, mk.dia order by mk.minuto) as n_dia
      from marcado mk
  ),
  por_dia as (
    select c.*,
           (c.n_dia > p.jornada_min
            or c.hora >= p.cierra_club
            or c.hora <  p.inicia_diurna) as extra_dia
      from contado c, param p
  ),
  -- Paso 2 · hacia las 42 h SOLO suman los minutos ordinarios. Es una suma
  -- acumulada y no un row_number() justamente por eso: un minuto que ya es
  -- extra por el día no avanza el contador de la semana.
  por_semana as (
    select d.*,
           sum(case when d.extra_dia then 0 else 1 end)
             over (partition by d.perfil_id, d.semana order by d.minuto) as n_semana_ord
      from por_dia d
  ),
  clasificado as (
    select s.perfil_id,
           s.dia,
           s.semana,
           s.dominical,
           (s.hora >= p.inicia_nocturna or s.hora < p.inicia_diurna) as nocturna,
           (s.extra_dia or s.n_semana_ord > p.semana_min)            as extra
      from por_semana s, param p
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
  'Minutos trabajados por persona y día, clasificados según la normativa (diurna/nocturna/extra/dominical). Hacia el tope de 42 h semanales solo suman los minutos ordinarios.';
