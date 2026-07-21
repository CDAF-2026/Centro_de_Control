-- ============================================================================
-- 0032 · Blindar las fórmulas contra saldos negativos
-- ----------------------------------------------------------------------------
-- Siigo puede dejar `balance` NEGATIVO en facturas anuladas (visto en FV-2-5497
-- y FV-2-5496: total 260.000, saldo −260.000, NC 260.000). Como la fórmula era
-- `total − saldo − nota_credito`, restar un negativo lo SUMABA y esas facturas
-- anuladas seguían contando como ingreso ($520.000 inflados).
--
-- Regla: el saldo nunca puede ser negativo para efectos de cálculo.
--   saldo_efectivo = greatest(saldo, 0)
-- ============================================================================

create or replace function public.siigo_recaudo(p_desde date, p_hasta date)
returns table (facturado bigint, cobrado bigint, pendiente bigint)
language sql stable as $$
  select coalesce(sum(greatest(total - nota_credito, 0)), 0)::bigint,
         coalesce(sum(greatest(total - greatest(saldo, 0) - nota_credito, 0)), 0)::bigint,
         coalesce(sum(greatest(saldo, 0)), 0)::bigint
  from public.siigo_facturas
  where fecha between p_desde and p_hasta;
$$;

create or replace function public.siigo_ingreso_diario(p_desde date, p_hasta date)
returns table (fecha date, monto bigint, facturas bigint)
language sql stable as $$
  select fecha,
         coalesce(sum(greatest(total - greatest(saldo, 0) - nota_credito, 0)), 0)::bigint,
         count(*) filter (where nota_credito < total)::bigint
  from public.siigo_facturas
  where fecha between p_desde and p_hasta
  group by fecha
  order by fecha;
$$;

create or replace function public.siigo_top_clientes(p_desde date, p_hasta date, p_limite int default 5)
returns table (cliente_id bigint, nombre text, pagado bigint)
language sql stable as $$
  select f.cliente_id,
         max(f.cliente_nombre_siigo) as nombre,
         sum(greatest(f.total - greatest(f.saldo, 0) - f.nota_credito, 0))::bigint as pagado
  from public.siigo_facturas f
  where f.fecha between p_desde and p_hasta
    and (f.cliente_id is not null
         or (f.cliente_identificacion is not null and f.cliente_identificacion !~ '^(.)\1+$'))
  group by f.cliente_id,
           case when f.cliente_id is null then f.cliente_identificacion end
  having sum(greatest(f.total - greatest(f.saldo, 0) - f.nota_credito, 0)) > 0
  order by pagado desc
  limit p_limite;
$$;

create or replace function public.siigo_ingreso_servicio(p_desde date, p_hasta date)
returns table (servicio_id bigint, monto bigint)
language sql stable as $$
  with l as (
    select li.factura_id, li.servicio_id, li.monto,
           sum(li.monto) over (partition by li.factura_id) as total_lineas
    from public.siigo_factura_lineas li
  )
  select l.servicio_id,
         sum(round(greatest(f.total - greatest(f.saldo, 0) - f.nota_credito, 0)
             * (l.monto::numeric / nullif(l.total_lineas, 0))))::bigint
  from l
  join public.siigo_facturas f on f.id = l.factura_id
  where f.fecha between p_desde and p_hasta
  group by l.servicio_id;
$$;

create or replace function public.siigo_ingreso_dia_servicio(p_desde date, p_hasta date)
returns table (fecha date, servicio_id bigint, monto bigint)
language sql stable as $$
  with l as (
    select li.factura_id, li.servicio_id, li.monto,
           sum(li.monto) over (partition by li.factura_id) as total_lineas
    from public.siigo_factura_lineas li
  )
  select f.fecha, l.servicio_id,
         sum(round(greatest(f.total - greatest(f.saldo, 0) - f.nota_credito, 0)
             * (l.monto::numeric / nullif(l.total_lineas, 0))))::bigint
  from l
  join public.siigo_facturas f on f.id = l.factura_id
  where f.fecha between p_desde and p_hasta
  group by f.fecha, l.servicio_id;
$$;

create or replace function public.siigo_resumen_cliente(p_cliente bigint)
returns table (servicio_id bigint, facturado bigint, pagado bigint)
language sql stable as $$
  with l as (
    select li.factura_id, li.servicio_id, li.monto,
           sum(li.monto) over (partition by li.factura_id) as total_lineas
    from public.siigo_factura_lineas li
  )
  select l.servicio_id,
         sum(round(greatest(f.total - f.nota_credito, 0)
             * (l.monto::numeric / nullif(l.total_lineas, 0))))::bigint,
         sum(round(greatest(f.total - greatest(f.saldo, 0) - f.nota_credito, 0)
             * (l.monto::numeric / nullif(l.total_lineas, 0))))::bigint
  from l
  join public.siigo_facturas f on f.id = l.factura_id
  where f.cliente_id = p_cliente
  group by l.servicio_id;
$$;

create or replace function public.siigo_facturas_cliente_servicio(p_cliente bigint)
returns table (
  servicio_id bigint, numero text, fecha date,
  facturado bigint, pagado bigint, pendiente bigint,
  nota_credito bigint, nc_numero text
)
language sql stable as $$
  with l as (
    select li.factura_id, li.servicio_id, li.monto,
           sum(li.monto) over (partition by li.factura_id) as total_lineas
    from public.siigo_factura_lineas li
  )
  select l.servicio_id, f.numero, f.fecha,
         sum(round(greatest(f.total - f.nota_credito, 0)
             * (l.monto::numeric / nullif(l.total_lineas, 0))))::bigint,
         sum(round(greatest(f.total - greatest(f.saldo, 0) - f.nota_credito, 0)
             * (l.monto::numeric / nullif(l.total_lineas, 0))))::bigint,
         sum(round(greatest(f.saldo, 0) * (l.monto::numeric / nullif(l.total_lineas, 0))))::bigint,
         max(f.nota_credito)::bigint,
         max(f.nc_numero)
  from l
  join public.siigo_facturas f on f.id = l.factura_id
  where f.cliente_id = p_cliente
  group by l.servicio_id, f.numero, f.fecha
  order by f.fecha, f.numero;
$$;
