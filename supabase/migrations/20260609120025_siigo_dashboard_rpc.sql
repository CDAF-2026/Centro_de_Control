-- ============================================================================
-- 0025 · Dashboard — agregaciones en SQL (corrige el tope de 1000 filas)
-- ----------------------------------------------------------------------------
-- El dashboard sumaba facturas fila a fila en el servidor y PostgREST corta a
-- 1000 filas → recaudo/serie diaria/top clientes salían truncados. Estas
-- funciones agregan en la base (sin tope) y devuelven solo los resultados.
-- ============================================================================

-- Recaudo del rango: facturado / cobrado / pendiente (nivel factura).
create or replace function public.siigo_recaudo(p_desde date, p_hasta date)
returns table (facturado bigint, cobrado bigint, pendiente bigint)
language sql stable as $$
  select coalesce(sum(total), 0)::bigint,
         coalesce(sum(total - saldo), 0)::bigint,
         coalesce(sum(saldo), 0)::bigint
  from public.siigo_facturas
  where fecha between p_desde and p_hasta;
$$;

-- Ingreso pagado por día (para la línea del periodo y las barras de la semana).
create or replace function public.siigo_ingreso_diario(p_desde date, p_hasta date)
returns table (fecha date, monto bigint, facturas bigint)
language sql stable as $$
  select fecha, coalesce(sum(total - saldo), 0)::bigint, count(*)::bigint
  from public.siigo_facturas
  where fecha between p_desde and p_hasta
  group by fecha
  order by fecha;
$$;

-- Top clientes por facturación pagada del rango. Identidad = nuestro cliente
-- enlazado o, si no, el NIT real de Siigo (el mostrador genérico no cuenta).
create or replace function public.siigo_top_clientes(p_desde date, p_hasta date, p_limite int default 5)
returns table (cliente_id bigint, nombre text, pagado bigint)
language sql stable as $$
  select f.cliente_id,
         max(f.cliente_nombre_siigo) as nombre,
         sum(f.total - f.saldo)::bigint as pagado
  from public.siigo_facturas f
  where f.fecha between p_desde and p_hasta
    and (f.total - f.saldo) > 0
    and (f.cliente_id is not null
         or (f.cliente_identificacion is not null and f.cliente_identificacion !~ '^(.)\1+$'))
  group by f.cliente_id,
           case when f.cliente_id is null then f.cliente_identificacion end
  order by pagado desc
  limit p_limite;
$$;

grant execute on function public.siigo_recaudo(date, date) to authenticated;
grant execute on function public.siigo_ingreso_diario(date, date) to authenticated;
grant execute on function public.siigo_top_clientes(date, date, int) to authenticated;
