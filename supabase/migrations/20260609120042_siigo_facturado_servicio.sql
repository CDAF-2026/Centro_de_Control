-- 0042 · Facturado por servicio (composición del ingreso del dashboard).
--
-- Gemela de `siigo_ingreso_servicio`, que prorratea lo COBRADO
-- (total - saldo - nota_credito). Aquí se prorratea lo FACTURADO
-- (total - nota_credito): lo que se emitió, se haya pagado o no.
-- El prorrateo por línea es idéntico, para que ambas lecturas sean comparables.

create or replace function public.siigo_facturado_servicio(p_desde date, p_hasta date)
returns table (servicio_id bigint, monto bigint)
language sql stable as $$
  with l as (
    select li.factura_id, li.servicio_id, li.monto,
           sum(li.monto) over (partition by li.factura_id) as total_lineas
    from public.siigo_factura_lineas li
  )
  select l.servicio_id,
         sum(round(greatest(f.total - f.nota_credito, 0)
             * (l.monto::numeric / nullif(l.total_lineas, 0))))::bigint
  from l
  join public.siigo_facturas f on f.id = l.factura_id
  where f.fecha between p_desde and p_hasta
  group by l.servicio_id;
$$;

grant execute on function public.siigo_facturado_servicio(date, date) to authenticated;

comment on function public.siigo_facturado_servicio(date, date) is
  'Facturado por servicio (total - nota_credito prorrateado por línea). Composición del ingreso.';
