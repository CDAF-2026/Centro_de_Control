-- ============================================================================
-- 0009 · Sprint 4 — Bolsa de pagos (M8). Datos demo; Siigo real luego.
-- ============================================================================

create type public.centro_costos as enum (
  'clase_particular',
  'cafeteria',
  'academia_tenis',
  'academia_padel',
  'otro'
);
create type public.pago_estado as enum ('sin_asignar', 'asignado');

create table public.pagos (
  id            bigint generated always as identity primary key,
  origen        text not null default 'manual', -- 'siigo' | 'manual'
  external_id   text,
  monto         integer not null check (monto >= 0),
  fecha         date not null default current_date,
  centro_costos public.centro_costos not null default 'otro',
  concepto      text,
  estado        public.pago_estado not null default 'sin_asignar',
  created_at    timestamptz not null default now()
);
create index pagos_estado_idx on public.pagos (estado);

create table public.asignaciones_pago (
  id         bigint generated always as identity primary key,
  pago_id    bigint not null unique references public.pagos (id) on delete cascade,
  cliente_id bigint not null references public.clientes (id) on delete cascade,
  servicio   text not null,
  periodos   text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index asignaciones_pago_cliente_idx on public.asignaciones_pago (cliente_id);

create table public.abonos (
  id            bigint generated always as identity primary key,
  cliente_id    bigint not null references public.clientes (id) on delete cascade,
  centro_costos public.centro_costos not null default 'cafeteria',
  monto         integer not null check (monto >= 0),
  nota          text,
  created_at    timestamptz not null default now()
);

grant select, insert, update, delete on public.pagos to authenticated;
grant select, insert, update, delete on public.asignaciones_pago to authenticated;
grant select, insert, update, delete on public.abonos to authenticated;
alter table public.pagos enable row level security;
alter table public.asignaciones_pago enable row level security;
alter table public.abonos enable row level security;

-- Bolsa de pagos y situación financiera: solo SA / CA (matriz de permisos).
create policy "pagos_rw" on public.pagos for all to authenticated
  using (private.user_role() in ('superadmin', 'coord_admin'))
  with check (private.user_role() in ('superadmin', 'coord_admin'));
create policy "asig_rw" on public.asignaciones_pago for all to authenticated
  using (private.user_role() in ('superadmin', 'coord_admin'))
  with check (private.user_role() in ('superadmin', 'coord_admin'));
create policy "abonos_rw" on public.abonos for all to authenticated
  using (private.user_role() in ('superadmin', 'coord_admin'))
  with check (private.user_role() in ('superadmin', 'coord_admin'));
