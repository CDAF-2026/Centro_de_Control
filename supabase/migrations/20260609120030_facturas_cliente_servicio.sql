-- ============================================================================
-- 0030 · Todas las facturas que componen cada servicio de un cliente
-- ----------------------------------------------------------------------------
-- Antes solo se listaban las PENDIENTES, así que el "Facturado" (que incluye
-- las ya pagadas) no se podía rastrear y parecía inflado. Ahora se devuelven
-- todas, con lo que cada una aporta al servicio: facturado / pagado / pendiente.
-- Mismas fórmulas netas de nota crédito que el resto (migración 0029).
-- ============================================================================

create or replace function public.siigo_facturas_cliente_servicio(p_cliente bigint)
returns table (
  servicio_id bigint, numero text, fecha date,
  facturado bigint, pagado bigint, pendiente bigint,
  nota_credito bigint, nc_numero text
)
language sql stable as $$
  select l.servicio_id, f.numero, f.fecha,
         sum(round(l.monto * (case when f.total > 0
              then greatest(f.total - f.nota_credito, 0)::numeric / f.total else 0 end)))::bigint,
         sum(round(l.monto * (case when f.total > 0
              then greatest(f.total - f.saldo - f.nota_credito, 0)::numeric / f.total else 0 end)))::bigint,
         sum(round(l.monto * (case when f.total > 0
              then f.saldo::numeric / f.total else 0 end)))::bigint,
         max(f.nota_credito)::bigint,
         max(f.nc_numero)
  from public.siigo_factura_lineas l
  join public.siigo_facturas f on f.id = l.factura_id
  where f.cliente_id = p_cliente
  group by l.servicio_id, f.numero, f.fecha
  order by f.fecha, f.numero;
$$;

grant execute on function public.siigo_facturas_cliente_servicio(bigint) to authenticated;

-- Reemplazada por la anterior (solo listaba pendientes).
drop function if exists public.siigo_facturas_pendientes_cliente(bigint);
