-- ============================================================================
-- 0029 · Notas crédito — dejar de contar como ingreso las facturas anuladas
-- ----------------------------------------------------------------------------
-- BUG (encontrado 2026-07-21): al anular una factura con nota crédito, Siigo le
-- deja `balance` = 0. El importador leía "saldo 0" como "pagada" y la contaba
-- como ingreso recibido. Impacto medido: $53.216.280 de ingreso inflado (~15%).
--
-- Fórmulas correctas (nota_credito = valor anulado de esa factura):
--   facturado = total − nota_credito
--   pagado    = total − saldo − nota_credito   (nunca negativo)
--   deuda     = saldo                          (Siigo ya lo deja bien)
-- ============================================================================

alter table public.siigo_facturas
  add column if not exists nota_credito integer not null default 0,
  add column if not exists nc_numero text;

comment on column public.siigo_facturas.nota_credito is
  'Valor anulado por nota(s) crédito de Siigo. Se resta de facturado y pagado.';
comment on column public.siigo_facturas.nc_numero is 'Número(s) de la(s) nota(s) crédito que anulan la factura.';

-- Aplica el mapa de notas crédito en un solo viaje: [{siigo_id, monto, numeros}]
create or replace function public.siigo_set_notas_credito(p jsonb)
returns integer language plpgsql as $$
declare afectadas integer;
begin
  -- Limpia las que ya no tienen nota crédito (p. ej. si se eliminó en Siigo).
  update public.siigo_facturas
     set nota_credito = 0, nc_numero = null
   where nota_credito <> 0
     and siigo_id not in (select e.value->>'siigo_id' from jsonb_array_elements(coalesce(p,'[]'::jsonb)) e);

  update public.siigo_facturas f
     set nota_credito = (e.value->>'monto')::int,
         nc_numero    = e.value->>'numeros'
    from jsonb_array_elements(coalesce(p,'[]'::jsonb)) e
   where f.siigo_id = e.value->>'siigo_id'
     and (f.nota_credito is distinct from (e.value->>'monto')::int
          or f.nc_numero is distinct from e.value->>'numeros');
  get diagnostics afectadas = row_count;
  return afectadas;
end $$;

-- ───────────────────── Recaudo del periodo (nivel factura) ─────────────────────
create or replace function public.siigo_recaudo(p_desde date, p_hasta date)
returns table (facturado bigint, cobrado bigint, pendiente bigint)
language sql stable as $$
  select coalesce(sum(greatest(total - nota_credito, 0)), 0)::bigint,
         coalesce(sum(greatest(total - saldo - nota_credito, 0)), 0)::bigint,
         coalesce(sum(saldo), 0)::bigint
  from public.siigo_facturas
  where fecha between p_desde and p_hasta;
$$;

-- ───────────────────── Ingreso pagado por día ─────────────────────
create or replace function public.siigo_ingreso_diario(p_desde date, p_hasta date)
returns table (fecha date, monto bigint, facturas bigint)
language sql stable as $$
  select fecha,
         coalesce(sum(greatest(total - saldo - nota_credito, 0)), 0)::bigint,
         count(*) filter (where nota_credito < total)::bigint
  from public.siigo_facturas
  where fecha between p_desde and p_hasta
  group by fecha
  order by fecha;
$$;

-- ───────────────────── Top clientes por lo efectivamente pagado ─────────────────────
create or replace function public.siigo_top_clientes(p_desde date, p_hasta date, p_limite int default 5)
returns table (cliente_id bigint, nombre text, pagado bigint)
language sql stable as $$
  select f.cliente_id,
         max(f.cliente_nombre_siigo) as nombre,
         sum(greatest(f.total - f.saldo - f.nota_credito, 0))::bigint as pagado
  from public.siigo_facturas f
  where f.fecha between p_desde and p_hasta
    and (f.cliente_id is not null
         or (f.cliente_identificacion is not null and f.cliente_identificacion !~ '^(.)\1+$'))
  group by f.cliente_id,
           case when f.cliente_id is null then f.cliente_identificacion end
  having sum(greatest(f.total - f.saldo - f.nota_credito, 0)) > 0
  order by pagado desc
  limit p_limite;
$$;

-- ───────────────────── Ingreso (porción pagada) por servicio ─────────────────────
create or replace function public.siigo_ingreso_servicio(p_desde date, p_hasta date)
returns table (servicio_id bigint, monto bigint)
language sql stable as $$
  select l.servicio_id,
         sum(round(l.monto * (case when f.total > 0
              then greatest(f.total - f.saldo - f.nota_credito, 0)::numeric / f.total
              else 0 end)))::bigint
  from public.siigo_factura_lineas l
  join public.siigo_facturas f on f.id = l.factura_id
  where f.fecha between p_desde and p_hasta
  group by l.servicio_id;
$$;

-- ───────────────────── Ingreso pagado por día + servicio ─────────────────────
create or replace function public.siigo_ingreso_dia_servicio(p_desde date, p_hasta date)
returns table (fecha date, servicio_id bigint, monto bigint)
language sql stable as $$
  select f.fecha, l.servicio_id,
         sum(round(l.monto * (case when f.total > 0
              then greatest(f.total - f.saldo - f.nota_credito, 0)::numeric / f.total
              else 0 end)))::bigint
  from public.siigo_factura_lineas l
  join public.siigo_facturas f on f.id = l.factura_id
  where f.fecha between p_desde and p_hasta
  group by f.fecha, l.servicio_id;
$$;

-- ───────────────────── Resumen financiero de un cliente ─────────────────────
create or replace function public.siigo_resumen_cliente(p_cliente bigint)
returns table (servicio_id bigint, facturado bigint, pagado bigint)
language sql stable as $$
  select l.servicio_id,
         sum(round(l.monto * (case when f.total > 0
              then greatest(f.total - f.nota_credito, 0)::numeric / f.total
              else 0 end)))::bigint,
         sum(round(l.monto * (case when f.total > 0
              then greatest(f.total - f.saldo - f.nota_credito, 0)::numeric / f.total
              else 0 end)))::bigint
  from public.siigo_factura_lineas l
  join public.siigo_facturas f on f.id = l.factura_id
  where f.cliente_id = p_cliente
  group by l.servicio_id;
$$;

grant execute on function public.siigo_set_notas_credito(jsonb) to authenticated;
