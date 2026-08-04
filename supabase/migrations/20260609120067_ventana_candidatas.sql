-- ============================================================================
-- 0067 · La ventana de candidatas se vuelve parámetro (y se estrecha a -5/+10)
-- ----------------------------------------------------------------------------
-- La ventana era ±15 días (un mes entero). Dos problemas medidos:
--   1. En modo ampliado (`?todas=1`) traía ~195 facturas para revisar a mano.
--   2. Peor: SOLAPABA torneos. Las facturas de torneo llegan en ráfagas cortas
--      (jun: 2–8 · jun: 26–27 · jul: 8–10 · jul: 17–20), así que ±15 días desde
--      un torneo alcanza al torneo anterior. Medido: al evento del 7-8 de agosto
--      le proponía la factura del 23-jul, que por fecha es de la ráfaga del
--      20-jul — o sea, de OTRO torneo.
-- Rango nuevo (decisión de Laura, ago-2026): 5 días antes y 10 después. Encaja
-- con las ráfagas reales y no llega al torneo vecino. Asimétrico a propósito: la
-- gente se inscribe pegado a la fecha, pero las cuentas de última hora y los
-- cobros pendientes se facturan días DESPUÉS.
-- ⚠️ No hay ni una factura de "Patrocinio torneo" en la historia (las 42 son
-- "Torneo"), así que estrechar el lado de "antes" no se lleva por delante pagos
-- anticipados de patrocinadores. Si algún día entran, revisar este rango.
--
-- Va como PARÁMETRO y no fijo en el SQL para que el rango viva en UN solo sitio
-- del código (`VENTANA_CANDIDATAS` en src/lib/eventos.ts), que es también el que
-- pinta la etiqueta "5 ago → 18 ago" en pantalla. Con el número escrito en los
-- dos lados, un cambio en uno dejaba la etiqueta mintiendo sobre lo que filtra.
-- ⚠️ DROP + CREATE: agregar parámetros dejando viva la firma vieja vuelve
-- ambigua la llamada.
-- ============================================================================

drop function if exists public.evento_facturas_candidatas(bigint, boolean);

create function public.evento_facturas_candidatas(
  p_evento         bigint,
  p_solo_servicio  boolean default true,
  p_dias_antes     int     default 5,
  p_dias_despues   int     default 10
)
returns table (
  id                     bigint,
  numero                 text,
  fecha                  date,
  cliente_nombre_siigo   text,
  cliente_identificacion text,
  cliente_id             bigint,
  total                  integer,
  saldo                  integer,
  estado_conciliacion    text,
  detalle                text,
  monto_evento           integer,
  n_candidatas           bigint,
  monto_candidatas       bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with ev as (
    select servicio_id,
           fecha_inicio - greatest(p_dias_antes, 0)                      as desde,
           coalesce(fecha_fin, fecha_inicio) + greatest(p_dias_despues, 0) as hasta
    from public.eventos
    where id = p_evento
  ),
  cand as (
    select f.id, f.numero, f.fecha, f.cliente_nombre_siigo, f.cliente_identificacion,
           f.cliente_id, f.total, f.saldo, f.estado_conciliacion,
           coalesce((
             select sum(l.monto)
             from public.siigo_factura_lineas l
             where l.factura_id = f.id and l.servicio_id = ev.servicio_id
           ), 0)::integer as monto_evento
    from public.siigo_facturas f
    cross join ev
    where f.evento_id is null
      and f.fecha between ev.desde and ev.hasta
      and (
        not p_solo_servicio
        or (ev.servicio_id is not null and exists (
              select 1 from public.siigo_factura_lineas l
              where l.factura_id = f.id and l.servicio_id = ev.servicio_id
           ))
      )
  )
  select c.id, c.numero, c.fecha, c.cliente_nombre_siigo, c.cliente_identificacion,
         c.cliente_id, c.total, c.saldo, c.estado_conciliacion,
         (select string_agg(distinct l2.descripcion, ' · ')
            from public.siigo_factura_lineas l2
           where l2.factura_id = c.id and l2.descripcion is not null),
         c.monto_evento,
         count(*) over ()::bigint,
         coalesce(sum(c.total) over (), 0)::bigint
  from cand c
  order by c.monto_evento desc, c.fecha, c.numero
  limit 200;
$$;

grant execute on function public.evento_facturas_candidatas(bigint, boolean, int, int) to authenticated;

comment on function public.evento_facturas_candidatas(bigint, boolean, int, int) is
  'Facturas atables a un evento dentro de su ventana (por defecto 5 días antes y 10 después; el rango real lo manda VENTANA_CANDIDATAS en src/lib/eventos.ts). p_solo_servicio=false trae todo lo facturado en la ventana.';
