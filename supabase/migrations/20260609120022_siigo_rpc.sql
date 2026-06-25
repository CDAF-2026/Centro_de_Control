-- ============================================================================
-- 0022 · Siigo — funciones de agregación (ingresos, cartera, resumen de cliente)
-- ----------------------------------------------------------------------------
-- La porción pagada de una línea = monto × (pagado_factura / total_factura).
-- Así el ingreso cuenta solo lo realmente recibido y la deuda = saldo de Siigo.
-- ============================================================================

-- Ingreso (porción pagada) por servicio en un rango de fechas.
create or replace function public.siigo_ingreso_servicio(p_desde date, p_hasta date)
returns table (servicio_id bigint, monto bigint)
language sql stable as $$
  select l.servicio_id,
         sum(round(l.monto * (case
           when f.total > 0 then (f.total - f.saldo)::numeric / f.total
           when f.saldo > 0 then 0 else 1 end)))::bigint
  from public.siigo_factura_lineas l
  join public.siigo_facturas f on f.id = l.factura_id
  where f.fecha between p_desde and p_hasta
  group by l.servicio_id;
$$;

-- Cartera: saldo pendiente por cliente (solo facturas ya atadas a un cliente).
create or replace function public.siigo_cartera()
returns table (cliente_id bigint, saldo bigint)
language sql stable as $$
  select cliente_id, sum(saldo)::bigint
  from public.siigo_facturas
  where saldo > 0 and cliente_id is not null
  group by cliente_id;
$$;

-- Resumen financiero de un cliente: facturado y pagado por servicio (saldo = facturado − pagado).
create or replace function public.siigo_resumen_cliente(p_cliente bigint)
returns table (servicio_id bigint, facturado bigint, pagado bigint)
language sql stable as $$
  select l.servicio_id,
         sum(l.monto)::bigint,
         sum(round(l.monto * (case
           when f.total > 0 then (f.total - f.saldo)::numeric / f.total
           when f.saldo > 0 then 0 else 1 end)))::bigint
  from public.siigo_factura_lineas l
  join public.siigo_facturas f on f.id = l.factura_id
  where f.cliente_id = p_cliente
  group by l.servicio_id;
$$;

grant execute on function public.siigo_ingreso_servicio(date, date) to authenticated;
grant execute on function public.siigo_cartera() to authenticated;
grant execute on function public.siigo_resumen_cliente(bigint) to authenticated;
