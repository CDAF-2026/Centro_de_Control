-- ============================================================================
-- 0026 · Ingreso pagado por día + servicio (para el detalle de "Los últimos 7 días")
-- ----------------------------------------------------------------------------
-- Misma prorrata que siigo_ingreso_servicio (porción pagada de cada línea), pero
-- agrupada además por fecha. La suma de un día ≡ la barra diaria (total − saldo).
-- ============================================================================

create or replace function public.siigo_ingreso_dia_servicio(p_desde date, p_hasta date)
returns table (fecha date, servicio_id bigint, monto bigint)
language sql stable as $$
  select f.fecha, l.servicio_id,
         sum(round(l.monto * (case
           when f.total > 0 then (f.total - f.saldo)::numeric / f.total
           when f.saldo > 0 then 0 else 1 end)))::bigint
  from public.siigo_factura_lineas l
  join public.siigo_facturas f on f.id = l.factura_id
  where f.fecha between p_desde and p_hasta
  group by f.fecha, l.servicio_id;
$$;

grant execute on function public.siigo_ingreso_dia_servicio(date, date) to authenticated;
