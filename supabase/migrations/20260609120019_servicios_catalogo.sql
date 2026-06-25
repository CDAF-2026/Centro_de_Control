-- ============================================================================
-- 0019 · F1 — Catálogo de servicios configurable (reemplaza el enum centro_costos)
-- ----------------------------------------------------------------------------
-- Una sola tabla `servicios` que sirve como centro de costo del pago Y como
-- servicio de conciliación. Permite "agregar nuevo servicio" (clínicas,
-- masterclass, patrocinios…) sin tocar la base.
-- ============================================================================

create table public.servicios (
  id              bigint generated always as identity primary key,
  clave           text unique not null,            -- slug estable (lógica + backfill)
  nombre          text not null,                   -- etiqueta visible
  color           text,                            -- hex para gráficos (null = neutro)
  categoria_saldo text,                            -- 'academia' | 'paquete' | 'particular' | null (informativo)
  activo          boolean not null default true,
  orden           int not null default 0,
  created_at      timestamptz not null default now()
);

-- Seed con los valores actuales para no romper nada (claves = enum centro_costos
-- + los servicios usados en la conciliación). Colores tomados de COLOR_FAMILIA.
insert into public.servicios (clave, nombre, color, categoria_saldo, orden) values
  ('academia_tenis',  'Academia tenis',    '#37474f', 'academia',   10),
  ('academia_padel',  'Academia pádel',    '#37474f', 'academia',   20),
  ('paquete',         'Paquete de clases', '#d4e157', 'paquete',    30),
  ('clase_particular','Clase particular',  '#3e6280', 'particular',  40),
  ('cafeteria',       'Cafetería',         '#f2b53d', null,          50),
  ('alquiler',        'Alquiler',          '#8aa0a8', null,          60),
  ('torneo',          'Torneo',            '#b591e0', null,          70),
  ('otro',            'Otro',              '#c8ccc4', null,          80);

-- ───────────────────── pagos: enum centro_costos -> servicio_id ─────────────
alter table public.pagos add column servicio_id bigint references public.servicios (id);
update public.pagos p set servicio_id = s.id
  from public.servicios s where s.clave = p.centro_costos::text;
alter table public.pagos alter column servicio_id set not null;
alter table public.pagos drop column centro_costos;
create index pagos_servicio_idx on public.pagos (servicio_id);

-- ───────────────────── abonos: enum -> servicio_id (default cafetería) ──────
alter table public.abonos add column servicio_id bigint references public.servicios (id);
update public.abonos a set servicio_id = s.id
  from public.servicios s where s.clave = a.centro_costos::text;
update public.abonos set servicio_id = (select id from public.servicios where clave = 'cafeteria')
  where servicio_id is null;
alter table public.abonos alter column servicio_id set not null;
alter table public.abonos drop column centro_costos;

-- ───────── asignaciones_pago: + servicio_id (conserva el texto `servicio`) ──
alter table public.asignaciones_pago add column servicio_id bigint references public.servicios (id);
update public.asignaciones_pago set servicio_id = (select id from public.servicios where clave = 'academia_tenis')  where servicio ilike 'academia tenis%';
update public.asignaciones_pago set servicio_id = (select id from public.servicios where clave = 'academia_padel')  where servicio ilike 'academia p%del%';
update public.asignaciones_pago set servicio_id = (select id from public.servicios where clave = 'paquete')         where servicio ilike 'paquete%';
update public.asignaciones_pago set servicio_id = (select id from public.servicios where clave = 'clase_particular') where servicio ilike 'clase particular%';
update public.asignaciones_pago set servicio_id = (select id from public.servicios where clave = 'cafeteria')       where servicio ilike 'cafeter%';
update public.asignaciones_pago set servicio_id = (select id from public.servicios where clave = 'alquiler')        where servicio ilike 'alquiler%';
update public.asignaciones_pago set servicio_id = (select id from public.servicios where clave = 'torneo')          where servicio ilike 'torneo%';

-- El enum ya no lo usa ninguna columna.
drop type public.centro_costos;

-- ─────────────────────────── Grants + RLS ──────────────────────────────────
grant select, insert, update, delete on public.servicios to authenticated;
alter table public.servicios enable row level security;

-- Lectura: cualquier usuario autenticado (los selects de pagos lo necesitan).
create policy "servicios_read" on public.servicios for select to authenticated using (true);
-- Escritura: solo SA / CA (mismo patrón que la bolsa de pagos).
create policy "servicios_write" on public.servicios for all to authenticated
  using (private.user_role() in ('superadmin', 'coord_admin'))
  with check (private.user_role() in ('superadmin', 'coord_admin'));
