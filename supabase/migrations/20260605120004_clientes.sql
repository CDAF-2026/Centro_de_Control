-- ============================================================================
-- 0004 · Clientes / Deportistas (M2) + acudientes
--   Los clientes NO son usuarios de auth (no inician sesión).
-- ============================================================================

create type public.cliente_estado as enum ('activo', 'retirado');

create table public.acudientes (
  id          bigint generated always as identity primary key,
  nombre      text not null,
  documento   text,
  telefono    text,
  email       text,
  parentesco  text,
  created_at  timestamptz not null default now()
);

create table public.clientes (
  id                  bigint generated always as identity primary key,
  nombres             text not null,
  apellidos           text not null,
  documento           text,
  fecha_nacimiento    date,
  es_menor            boolean not null default false,
  celular             text,
  email               text,
  contacto_emergencia text,
  acudiente_id        bigint references public.acudientes (id) on delete set null,
  estado              public.cliente_estado not null default 'activo',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- Regla dura del PRD: un menor de edad EXIGE acudiente.
  constraint cliente_menor_requiere_acudiente
    check (es_menor = false or acudiente_id is not null)
);

create index clientes_estado_idx on public.clientes (estado);
create index clientes_nombre_idx on public.clientes (apellidos, nombres);

create trigger clientes_set_updated_at
  before update on public.clientes
  for each row execute function private.set_updated_at();

grant select, insert, update on public.acudientes to authenticated;
grant select, insert, update on public.clientes to authenticated;
alter table public.acudientes enable row level security;
alter table public.clientes enable row level security;

-- RLS (matriz "clientes"): leer SA/CA/CD/RC · escribir SA/CA/RC · profesor sin acceso.
create policy "clientes_select" on public.clientes
  for select to authenticated
  using (private.user_role() in ('superadmin', 'coord_admin', 'coord_deportivo', 'recepcion'));

create policy "clientes_insert" on public.clientes
  for insert to authenticated
  with check (private.user_role() in ('superadmin', 'coord_admin', 'recepcion'));

create policy "clientes_update" on public.clientes
  for update to authenticated
  using (private.user_role() in ('superadmin', 'coord_admin', 'recepcion'))
  with check (private.user_role() in ('superadmin', 'coord_admin', 'recepcion'));

-- Acudientes: mismo modelo de acceso que clientes.
create policy "acudientes_select" on public.acudientes
  for select to authenticated
  using (private.user_role() in ('superadmin', 'coord_admin', 'coord_deportivo', 'recepcion'));

create policy "acudientes_insert" on public.acudientes
  for insert to authenticated
  with check (private.user_role() in ('superadmin', 'coord_admin', 'recepcion'));

create policy "acudientes_update" on public.acudientes
  for update to authenticated
  using (private.user_role() in ('superadmin', 'coord_admin', 'recepcion'))
  with check (private.user_role() in ('superadmin', 'coord_admin', 'recepcion'));
