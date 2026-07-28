-- 0041 · Facturado diario (para el comparativo periodo vs periodo anterior del dashboard).
--
-- OJO: no confundir con `siigo_ingreso_diario`, que devuelve lo COBRADO
-- (total - saldo - nota_credito). Aquí interesa lo FACTURADO: lo que se emitió en
-- la factura, neto de notas crédito, sin importar si ya se pagó.
-- Misma definición de "facturado" que usa `siigo_recaudo` para que las cifras cuadren.

create or replace function public.siigo_facturado_diario(p_desde date, p_hasta date)
returns table (fecha date, monto bigint, facturas bigint)
language sql stable as $$
  select fecha,
         coalesce(sum(greatest(total - nota_credito, 0)), 0)::bigint,
         count(*) filter (where nota_credito < total)::bigint
  from public.siigo_facturas
  where fecha between p_desde and p_hasta
  group by fecha
  order by fecha;
$$;

comment on function public.siigo_facturado_diario(date, date) is
  'Facturado por día (total - nota_credito), neto de NC. Para el comparativo del dashboard.';
