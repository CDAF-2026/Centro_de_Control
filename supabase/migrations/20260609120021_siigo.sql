-- ============================================================================
-- 0021 · Integración Siigo — facturación como fuente de verdad del dinero
-- ----------------------------------------------------------------------------
-- Catálogo de servicios alineado a los 18 grupos de productos de Siigo
-- (account_group) + tablas para importar facturas (con su saldo = deuda),
-- líneas (desglose por categoría) y caché de productos.
-- ============================================================================

-- ── Mapeo catálogo ↔ grupo de productos de Siigo ──
alter table public.servicios add column siigo_grupo text;

-- Reusar servicios existentes que ya equivalen a un grupo de Siigo.
update public.servicios set siigo_grupo = 'Academia de Tenis' where clave = 'academia_tenis';
update public.servicios set siigo_grupo = 'Academia de Padel' where clave = 'academia_padel';
update public.servicios set siigo_grupo = 'Cafeteria'         where clave = 'cafeteria';
update public.servicios set siigo_grupo = 'Torneos'           where clave = 'torneo';
update public.servicios set siigo_grupo = 'Producto Generico' where clave = 'otro';

-- Crear los servicios faltantes (1:1 con el grupo de Siigo; nombre exacto del grupo
-- para el emparejamiento producto→grupo→servicio en el importador).
insert into public.servicios (clave, nombre, color, categoria_saldo, siigo_grupo, orden) values
  ('clases_tenis',             'Clases de tenis',            '#3e6280', 'particular', 'Clases de Tenis',             45),
  ('clases_padel',             'Clases de pádel',            '#3e6280', 'particular', 'Clases de Padel',             46),
  ('alto_rendimiento_tenis',   'Alto rendimiento tenis',     '#5c6bc0', 'academia',   'Alto rendimiento tenis',      25),
  ('alto_rendimiento_joaquin', 'Alto rendimiento Joaquín',   '#5c6bc0', 'academia',   'Alto rendimiento Joaquin',    26),
  ('preparacion_fisica',       'Preparación física',         '#26a69a', 'academia',   'Preparación física',          27),
  ('convenios_colegios',       'Convenios colegios',         '#66bb6a', 'academia',   'CONVENIOS COLEGIOS',          28),
  ('alquiler_tenis',           'Alquiler tenis',             '#8aa0a8', null,         'Alquiler Tenis',              61),
  ('alquiler_padel',           'Alquiler pádel',             '#8aa0a8', null,         'Alquiler Padel',              62),
  ('almacen',                  'Almacén',                    '#a1887f', null,         'Almacen',                     55),
  ('vacacionales',             'Vacacionales',               '#ffa726', null,         'VACACIONALES RECREATVIOS',    75),
  ('patrocinio',               'Patrocinio',                 '#b591e0', null,         'Patrocinio',                  71),
  ('patrocinio_torneo',        'Patrocinio torneo',          '#b591e0', null,         'Patrocinio Torneo',           72),
  ('comision_entrega',         'Comisión punto de entrega',  '#c8ccc4', null,         'Comisión punto de entrega',   76);

-- ── Facturas importadas de Siigo ──
create table public.siigo_facturas (
  id                   bigint generated always as identity primary key,
  siigo_id             text unique not null,                 -- id de la factura en Siigo (dedup)
  numero               text,                                  -- p. ej. FV-3-16756
  fecha                date not null,
  cliente_identificacion text,                                -- NIT/cédula que trae Siigo
  cliente_id           bigint references public.clientes (id) on delete set null,  -- nuestro cliente (conciliación)
  evento_id            bigint references public.eventos (id) on delete set null,   -- evento al que se ata (opcional)
  total                integer not null default 0,
  saldo                integer not null default 0,            -- balance pendiente = deuda
  estado_conciliacion  text not null default 'pendiente',     -- auto | pendiente | mostrador | conciliada
  created_at           timestamptz not null default now()
);
create index siigo_facturas_fecha_idx on public.siigo_facturas (fecha);
create index siigo_facturas_cliente_idx on public.siigo_facturas (cliente_id);
create index siigo_facturas_estado_idx on public.siigo_facturas (estado_conciliacion);

-- ── Líneas de cada factura (desglose por categoría/servicio) ──
create table public.siigo_factura_lineas (
  id          bigint generated always as identity primary key,
  factura_id  bigint not null references public.siigo_facturas (id) on delete cascade,
  codigo      text,                                           -- código de producto (AF###)
  descripcion text,
  servicio_id bigint references public.servicios (id) on delete set null,
  monto       integer not null default 0,                     -- total de la línea
  cantidad    numeric(12, 2) not null default 1
);
create index siigo_factura_lineas_factura_idx on public.siigo_factura_lineas (factura_id);
create index siigo_factura_lineas_servicio_idx on public.siigo_factura_lineas (servicio_id);

-- ── Caché producto → grupo → servicio (evita refetch de ~477 productos cada sync) ──
create table public.siigo_productos (
  codigo        text primary key,
  nombre        text,
  account_group text,
  servicio_id   bigint references public.servicios (id) on delete set null,
  updated_at    timestamptz not null default now()
);

-- ── Cursor del sync incremental (una sola fila) ──
create table public.siigo_sync (
  id          int primary key default 1,
  last_cursor date,
  updated_at  timestamptz not null default now(),
  constraint siigo_sync_single check (id = 1)
);

-- ─────────────────────────── Grants + RLS ───────────────────────────
grant select, insert, update, delete on public.siigo_facturas to authenticated;
grant select, insert, update, delete on public.siigo_factura_lineas to authenticated;
grant select, insert, update, delete on public.siigo_productos to authenticated;
grant select, insert, update, delete on public.siigo_sync to authenticated;
alter table public.siigo_facturas enable row level security;
alter table public.siigo_factura_lineas enable row level security;
alter table public.siigo_productos enable row level security;
alter table public.siigo_sync enable row level security;

-- Leer: staff. Escribir: SA/CA (es información financiera).
create policy "siigo_fac_select" on public.siigo_facturas for select to authenticated
  using (private.user_role() in ('superadmin','coord_admin','coord_deportivo','recepcion','profesor'));
create policy "siigo_fac_write" on public.siigo_facturas for all to authenticated
  using (private.user_role() in ('superadmin','coord_admin'))
  with check (private.user_role() in ('superadmin','coord_admin'));

create policy "siigo_lin_select" on public.siigo_factura_lineas for select to authenticated
  using (private.user_role() in ('superadmin','coord_admin','coord_deportivo','recepcion','profesor'));
create policy "siigo_lin_write" on public.siigo_factura_lineas for all to authenticated
  using (private.user_role() in ('superadmin','coord_admin'))
  with check (private.user_role() in ('superadmin','coord_admin'));

create policy "siigo_prod_select" on public.siigo_productos for select to authenticated
  using (private.user_role() in ('superadmin','coord_admin','coord_deportivo','recepcion','profesor'));
create policy "siigo_prod_write" on public.siigo_productos for all to authenticated
  using (private.user_role() in ('superadmin','coord_admin'))
  with check (private.user_role() in ('superadmin','coord_admin'));

create policy "siigo_sync_rw" on public.siigo_sync for all to authenticated
  using (private.user_role() in ('superadmin','coord_admin'))
  with check (private.user_role() in ('superadmin','coord_admin'));
