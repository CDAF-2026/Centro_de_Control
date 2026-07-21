-- ============================================================================
-- 0028 · Facturas pendientes de un cliente, desglosadas por servicio
-- ----------------------------------------------------------------------------
-- Para poder validar QUÉ facturas generan cada saldo de la Situación financiera.
-- Usa la misma prorrata que siigo_resumen_cliente: pendiente = monto × saldo/total,
-- así la suma por servicio ≡ el "Debe" que ya muestra la ficha.
-- ============================================================================

create or replace function public.siigo_facturas_pendientes_cliente(p_cliente bigint)
returns table (servicio_id bigint, numero text, fecha date, pendiente bigint)
language sql stable as $$
  select l.servicio_id, f.numero, f.fecha,
         sum(round(l.monto * (case
           when f.total > 0 then f.saldo::numeric / f.total
           when f.saldo > 0 then 1 else 0 end)))::bigint
  from public.siigo_factura_lineas l
  join public.siigo_facturas f on f.id = l.factura_id
  where f.cliente_id = p_cliente and f.saldo > 0
  group by l.servicio_id, f.numero, f.fecha
  having sum(round(l.monto * (case
           when f.total > 0 then f.saldo::numeric / f.total
           when f.saldo > 0 then 1 else 0 end))) > 0
  order by f.fecha, f.numero;
$$;

grant execute on function public.siigo_facturas_pendientes_cliente(bigint) to authenticated;
