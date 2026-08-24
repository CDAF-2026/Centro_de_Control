-- ============================================================================
-- 0062 · Antigüedad de la cartera (tramos 0–30 / 31–60 / +60 días)
-- ----------------------------------------------------------------------------
-- Para cobrar no sirve "toda la cartera junta": lo que dice a quién llamar
-- primero es cuánto lleva esperando cada factura.
--
-- ⚠️ Se mide desde la FECHA DE EMISIÓN, no desde el vencimiento: verificado
-- contra la API de Siigo (jul-2026), una factura trae `id, document, prefix,
-- number, name, date, customer, seller, total, balance, observations, items,
-- payments, stamp, mail, metadata, public_url` — **no hay `due_date` ni plazo**.
-- Como el club factura casi todo en el momento (cafetería, alquileres, clases),
-- emisión ≈ vencimiento; pero la etiqueta en pantalla dice "desde la factura" y
-- no "vencida", que sería afirmar algo que no sabemos.
--
-- Va en SQL y no en JS por la regla 2: hoy son 58 facturas pendientes, pero
-- PostgREST corta en 1.000 filas y el día que se pase, el total se desinflaría
-- en silencio. (El total que ya pintaba la pantalla tenía justo ese problema.)
--
-- Devuelve SIEMPRE los tres tramos, aunque estén en cero, para que las tarjetas
-- no bailen. `desde`/`hasta` son los límites de fecha que usó cada tramo: la
-- pantalla filtra el listado con ESOS mismos valores, así el número de la
-- tarjeta y las filas de abajo no se pueden desincronizar por un día.
-- `security invoker`: la RLS de `siigo_facturas` (superadmin + coord. admin) es
-- justo la que debe aplicar.
-- ============================================================================

create or replace function public.siigo_cartera_antiguedad(
  p_servicio bigint default null
)
returns table (tramo text, n bigint, total bigint, desde date, hasta date)
language sql
stable
security invoker
set search_path = ''
as $$
  with tramos as (
    select * from (values
      ('0_30',   (current_date - 30)::date, null::date),
      ('31_60',  (current_date - 60)::date, (current_date - 31)::date),
      ('60_mas', null::date,                (current_date - 61)::date)
    ) as t(tramo, desde, hasta)
  ),
  pendientes as (
    select f.fecha, f.saldo
    from public.siigo_facturas f
    where f.saldo > 0
      and (
        p_servicio is null
        or exists (
          select 1 from public.siigo_factura_lineas l
          where l.factura_id = f.id and l.servicio_id = p_servicio
        )
      )
  )
  select t.tramo,
         count(p.*)::bigint,
         coalesce(sum(p.saldo), 0)::bigint,
         t.desde,
         t.hasta
  from tramos t
  left join pendientes p
    on (t.desde is null or p.fecha >= t.desde)
   and (t.hasta is null or p.fecha <= t.hasta)
  group by t.tramo, t.desde, t.hasta
  order by case t.tramo when '0_30' then 1 when '31_60' then 2 else 3 end;
$$;

revoke all on function public.siigo_cartera_antiguedad(bigint) from public, anon;
grant execute on function public.siigo_cartera_antiguedad(bigint) to authenticated;

comment on function public.siigo_cartera_antiguedad(bigint) is
  'Cartera pendiente por tramos de antigüedad (desde la fecha de la factura; Siigo no expone vencimiento).';

notify pgrst, 'reload schema';
