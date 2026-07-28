-- ============================================================================
-- 0048 · Eventos con P&G: gastos, cierre y utilidad neta al dashboard
-- ----------------------------------------------------------------------------
-- Hasta ahora un torneo aportaba al dashboard su facturación BRUTA: si facturaba
-- $4.000.000 y se gastaba $3.000.000 en premios y refrigerios, el marcador leía
-- $4.000.000. Ahora el evento tiene gastos propios, un P&G, y un acto explícito de
-- CIERRE; solo la utilidad de los eventos cerrados entra a las cifras del dashboard.
--
-- Decisiones (Laura, jul-2026):
--   · Los gastos se capturan a mano aquí, no se importan las compras (FC) de Siigo.
--   · El costo del evento = gastos registrados + lo que se paga a sus profesores
--     (`evento_profesores.pago`, que ya alimenta Liquidación). Se toma automático,
--     así que NO hay que registrarlo también como gasto: se contaría doble.
--   · No se toca Siigo. El centro de costos de Siigo está apagado en las facturas
--     de venta y, aun prendido, diría "esto es de torneos" pero no DE CUÁL torneo.
--     `siigo_facturas.evento_id` (que se asigna en /pagos) sí lo distingue.
-- ============================================================================

-- ─────────────────────────── Gastos del evento ───────────────────────────
create table public.evento_gastos (
  id             bigint generated always as identity primary key,
  evento_id      bigint not null references public.eventos (id) on delete cascade,
  concepto       text not null,
  categoria      text not null default 'otro',   -- refrigerios|premios|logistica|publicidad|arbitraje|staff_externo|otro
  monto          integer not null default 0 check (monto >= 0),
  proveedor      text,
  fecha          date not null default current_date,
  soporte_path   text,                            -- archivo en el bucket `evento-docs`
  registrado_por uuid references public.profiles (id) on delete set null,
  notas          text,
  created_at     timestamptz not null default now()
);
create index evento_gastos_evento_idx on public.evento_gastos (evento_id);

-- ─────────────────── Cierre del evento + snapshot congelado ───────────────────
-- El snapshot NO es redundante: si el dashboard recalculara la utilidad en vivo, una
-- factura que llega tarde o un gasto que alguien corrige moverían un mes ya publicado.
-- Al cerrar se congela la cifra; para corregir hay que REABRIR (queda en audit_log).
alter table public.eventos add column cerrado_el      timestamptz;
alter table public.eventos add column cerrado_por     uuid references public.profiles (id) on delete set null;
alter table public.eventos add column cierre_ingreso  integer;   -- facturado del evento al cerrar
alter table public.eventos add column cierre_costo    integer;   -- gastos + pago a profesores
alter table public.eventos add column cierre_utilidad integer;   -- ingreso − costo (puede ser negativo)

comment on column public.eventos.cierre_utilidad is
  'Utilidad congelada al cerrar. Es LO ÚNICO que el evento aporta al dashboard, imputado a coalesce(fecha_fin, fecha_inicio).';

-- ─────────────────────────── Grants + RLS ───────────────────────────
grant select, insert, update, delete on public.evento_gastos to authenticated;
alter table public.evento_gastos enable row level security;

-- Mismo criterio que `evento_profesores`: lee todo el staff, escribe SA/CA.
create policy "evento_gastos_select" on public.evento_gastos for select to authenticated
  using (private.user_role() in ('superadmin','coord_admin','coord_deportivo','recepcion','profesor'));
create policy "evento_gastos_write" on public.evento_gastos for all to authenticated
  using (private.user_role() in ('superadmin','coord_admin'))
  with check (private.user_role() in ('superadmin','coord_admin'));

-- Bucket privado para los soportes de gasto (factura del proveedor, foto del recibo).
insert into storage.buckets (id, name, public)
values ('evento-docs', 'evento-docs', false)
on conflict (id) do nothing;

create policy "evento_docs_obj_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'evento-docs' and private.user_role() in ('superadmin', 'coord_admin'));

create policy "evento_docs_obj_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'evento-docs' and private.user_role() in ('superadmin', 'coord_admin'));

create policy "evento_docs_obj_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'evento-docs' and private.user_role() in ('superadmin', 'coord_admin'));

create policy "evento_docs_obj_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'evento-docs' and private.user_role() in ('superadmin', 'coord_admin'));

-- ═══════════════════════════ P&G del evento ═══════════════════════════
-- Una sola función para el detalle y para el listado (p_evento null = todos), así la
-- fórmula vive en un solo lugar. Todo se suma en la BASE: traer facturas fila a fila
-- y agregarlas en JS trunca en 1000 filas (tope de PostgREST).
--
-- Fórmulas idénticas a las de `siigo_recaudo` (migración 0032), incluido el blindaje
-- contra saldos negativos: Siigo deja `balance` negativo en facturas anuladas y
-- restar un negativo lo sumaba.
create or replace function public.eventos_pyg(p_evento bigint default null)
returns table (
  evento_id         bigint,
  ingreso_facturado bigint,
  ingreso_cobrado   bigint,
  pendiente_cobro   bigint,
  gastos            bigint,
  pago_profesores   bigint,
  costo_total       bigint,
  utilidad          bigint,
  facturas          bigint
)
language sql stable as $$
  select e.id,
         coalesce(f.facturado, 0)::bigint,
         coalesce(f.cobrado, 0)::bigint,
         coalesce(f.pendiente, 0)::bigint,
         coalesce(g.gastos, 0)::bigint,
         coalesce(pr.pago, 0)::bigint,
         (coalesce(g.gastos, 0) + coalesce(pr.pago, 0))::bigint,
         (coalesce(f.facturado, 0) - coalesce(g.gastos, 0) - coalesce(pr.pago, 0))::bigint,
         coalesce(f.n, 0)::bigint
  from public.eventos e
  left join lateral (
    select sum(greatest(sf.total - sf.nota_credito, 0))                                as facturado,
           sum(greatest(sf.total - greatest(sf.saldo, 0) - sf.nota_credito, 0))        as cobrado,
           sum(greatest(sf.saldo, 0))                                                  as pendiente,
           count(*) filter (where sf.nota_credito < sf.total)                          as n
    from public.siigo_facturas sf
    where sf.evento_id = e.id
  ) f on true
  left join lateral (
    select sum(eg.monto) as gastos from public.evento_gastos eg where eg.evento_id = e.id
  ) g on true
  left join lateral (
    select sum(ep.pago) as pago from public.evento_profesores ep where ep.evento_id = e.id
  ) pr on true
  where p_evento is null or e.id = p_evento;
$$;

grant execute on function public.eventos_pyg(bigint) to authenticated;

comment on function public.eventos_pyg(bigint) is
  'P&G en vivo del evento (null = todos). Ingreso = facturas de Siigo atadas por evento_id; costo = gastos + pago a profesores.';

-- ─────────── Lo que el evento APORTA al dashboard (solo eventos cerrados) ───────────
-- Se imputa a coalesce(fecha_fin, fecha_inicio): el resultado cae en el mes del evento.
-- OJO: cerrar en agosto un torneo de junio cambia el total de junio ese día.
create or replace function public.eventos_resultado_periodo(p_desde date, p_hasta date)
returns table (evento_id bigint, nombre text, servicio_id bigint, utilidad bigint)
language sql stable as $$
  select e.id, e.nombre, e.servicio_id, coalesce(e.cierre_utilidad, 0)::bigint
  from public.eventos e
  where e.cerrado_el is not null
    and e.estado <> 'cancelado'
    and coalesce(e.fecha_fin, e.fecha_inicio) between p_desde and p_hasta;
$$;

grant execute on function public.eventos_resultado_periodo(date, date) to authenticated;

comment on function public.eventos_resultado_periodo(date, date) is
  'Utilidad congelada de los eventos CERRADOS imputados al periodo. Es lo que el dashboard suma en vez del bruto.';

-- ─────────── Lo que el dashboard está RETENIENDO (eventos aún sin cerrar) ───────────
-- Se cuenta por FECHA DE FACTURA, que es el criterio con el que el dashboard las
-- excluye: así el aviso dice exactamente cuánto le falta a la cifra del periodo.
create or replace function public.eventos_retenido(p_desde date, p_hasta date)
returns table (eventos bigint, facturado bigint)
language sql stable as $$
  select count(distinct f.evento_id)::bigint,
         coalesce(sum(greatest(f.total - f.nota_credito, 0)), 0)::bigint
  from public.siigo_facturas f
  join public.eventos e on e.id = f.evento_id
  where f.fecha between p_desde and p_hasta
    and e.cerrado_el is null
    and e.estado <> 'cancelado';
$$;

grant execute on function public.eventos_retenido(date, date) to authenticated;

comment on function public.eventos_retenido(date, date) is
  'Facturado de eventos ABIERTOS que cae en el periodo: lo que el dashboard no está mostrando todavía. Para el aviso de transparencia.';

-- ═══════════ Sacar el bruto de los eventos de las cifras del dashboard ═══════════
-- Se agrega `p_excluir_eventos` (default false) SOLO a las 4 funciones que alimentan la
-- línea de ingresos del dashboard. Con el default, todo lo demás sigue igual:
--   · /ingresos, /cartera y /reportes son el detalle contable y deben cuadrar con Siigo.
--   · `liquidacion.ts` calcula la comisión de alto rendimiento con `siigo_ingreso_servicio`
--     (que NO se toca): quitarle facturas cambiaría lo que se le paga a un profesor.
--   · La deuda de una factura de torneo sigue siendo cartera cobrable.
--
-- Se DROPEA la versión de 2 argumentos antes de recrear: dejar ambas convierte
-- `siigo_recaudo(date, date)` en una llamada ambigua ("function is not unique").
-- Los llamadores actuales pasan 2 argumentos y caen en el default (false).

drop function if exists public.siigo_recaudo(date, date);
create or replace function public.siigo_recaudo(p_desde date, p_hasta date, p_excluir_eventos boolean default false)
returns table (facturado bigint, cobrado bigint, pendiente bigint)
language sql stable as $$
  select coalesce(sum(greatest(total - nota_credito, 0)), 0)::bigint,
         coalesce(sum(greatest(total - greatest(saldo, 0) - nota_credito, 0)), 0)::bigint,
         coalesce(sum(greatest(saldo, 0)), 0)::bigint
  from public.siigo_facturas
  where fecha between p_desde and p_hasta
    and (not p_excluir_eventos or evento_id is null);
$$;
grant execute on function public.siigo_recaudo(date, date, boolean) to authenticated;

drop function if exists public.siigo_ingreso_diario(date, date);
create or replace function public.siigo_ingreso_diario(p_desde date, p_hasta date, p_excluir_eventos boolean default false)
returns table (fecha date, monto bigint, facturas bigint)
language sql stable as $$
  select fecha,
         coalesce(sum(greatest(total - greatest(saldo, 0) - nota_credito, 0)), 0)::bigint,
         count(*) filter (where nota_credito < total)::bigint
  from public.siigo_facturas
  where fecha between p_desde and p_hasta
    and (not p_excluir_eventos or evento_id is null)
  group by fecha
  order by fecha;
$$;
grant execute on function public.siigo_ingreso_diario(date, date, boolean) to authenticated;

drop function if exists public.siigo_facturado_diario(date, date);
create or replace function public.siigo_facturado_diario(p_desde date, p_hasta date, p_excluir_eventos boolean default false)
returns table (fecha date, monto bigint, facturas bigint)
language sql stable as $$
  select fecha,
         coalesce(sum(greatest(total - nota_credito, 0)), 0)::bigint,
         count(*) filter (where nota_credito < total)::bigint
  from public.siigo_facturas
  where fecha between p_desde and p_hasta
    and (not p_excluir_eventos or evento_id is null)
  group by fecha
  order by fecha;
$$;
grant execute on function public.siigo_facturado_diario(date, date, boolean) to authenticated;

drop function if exists public.siigo_facturado_servicio(date, date);
create or replace function public.siigo_facturado_servicio(p_desde date, p_hasta date, p_excluir_eventos boolean default false)
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
    and (not p_excluir_eventos or f.evento_id is null)
  group by l.servicio_id;
$$;
grant execute on function public.siigo_facturado_servicio(date, date, boolean) to authenticated;
