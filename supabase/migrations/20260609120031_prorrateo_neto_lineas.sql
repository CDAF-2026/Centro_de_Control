-- ============================================================================
-- 0031 · Desglose por servicio neto de retención (cuadra con el nivel factura)
-- ----------------------------------------------------------------------------
-- Las líneas de Siigo traen el valor BRUTO (base + IVA), pero el total de la
-- factura viene NETO de retenciones (ReteIVA 15% que practican las empresas).
-- Al repartir usando el bruto, el ingreso por servicio quedaba ~$1,6M por
-- encima del de nivel factura.
--
-- Solución: repartir los importes NETOS de la factura entre sus líneas según la
-- participación de cada una (monto / suma de montos de esa factura). Así el
-- desglose por servicio suma SIEMPRE igual que el nivel factura, y de paso se
-- corrige cualquier otro descuento aplicado al total.
--
-- El IVA se conserva dentro del ingreso (decisión de Laura: es plata que el
-- centro recauda y guarda hasta declararla).
-- ============================================================================

-- Ingreso (porción pagada) por servicio.
create or replace function public.siigo_ingreso_servicio(p_desde date, p_hasta date)
returns table (servicio_id bigint, monto bigint)
language sql stable as $$
  with l as (
    select li.factura_id, li.servicio_id, li.monto,
           sum(li.monto) over (partition by li.factura_id) as total_lineas
    from public.siigo_factura_lineas li
  )
  select l.servicio_id,
         sum(round(greatest(f.total - f.saldo - f.nota_credito, 0)
             * (l.monto::numeric / nullif(l.total_lineas, 0))))::bigint
  from l
  join public.siigo_facturas f on f.id = l.factura_id
  where f.fecha between p_desde and p_hasta
  group by l.servicio_id;
$$;

-- Ingreso pagado por día + servicio.
create or replace function public.siigo_ingreso_dia_servicio(p_desde date, p_hasta date)
returns table (fecha date, servicio_id bigint, monto bigint)
language sql stable as $$
  with l as (
    select li.factura_id, li.servicio_id, li.monto,
           sum(li.monto) over (partition by li.factura_id) as total_lineas
    from public.siigo_factura_lineas li
  )
  select f.fecha, l.servicio_id,
         sum(round(greatest(f.total - f.saldo - f.nota_credito, 0)
             * (l.monto::numeric / nullif(l.total_lineas, 0))))::bigint
  from l
  join public.siigo_facturas f on f.id = l.factura_id
  where f.fecha between p_desde and p_hasta
  group by f.fecha, l.servicio_id;
$$;

-- Resumen financiero de un cliente (facturado / pagado por servicio).
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
         sum(round(greatest(f.total - f.saldo - f.nota_credito, 0)
             * (l.monto::numeric / nullif(l.total_lineas, 0))))::bigint
  from l
  join public.siigo_facturas f on f.id = l.factura_id
  where f.cliente_id = p_cliente
  group by l.servicio_id;
$$;

-- Facturas que componen cada servicio de un cliente.
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
         sum(round(greatest(f.total - f.saldo - f.nota_credito, 0)
             * (l.monto::numeric / nullif(l.total_lineas, 0))))::bigint,
         sum(round(f.saldo * (l.monto::numeric / nullif(l.total_lineas, 0))))::bigint,
         max(f.nota_credito)::bigint,
         max(f.nc_numero)
  from l
  join public.siigo_facturas f on f.id = l.factura_id
  where f.cliente_id = p_cliente
  group by l.servicio_id, f.numero, f.fecha
  order by f.fecha, f.numero;
$$;
