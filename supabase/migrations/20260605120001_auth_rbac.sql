-- ============================================================================
-- 0001 · Roles, perfiles y base de RBAC/RLS — Centro de Control CDAF
-- ============================================================================

-- ───────────────────────── Roles ─────────────────────────
create type public.app_role as enum (
  'superadmin',
  'coord_admin',
  'coord_deportivo',
  'recepcion',
  'profesor'
);

-- ─────────── Schema privado para helpers (NO expuesto a la Data API) ───────────
create schema if not exists private;
grant usage on schema private to authenticated;

-- ───────────────────────── Tabla de perfiles ─────────────────────────
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  role       public.app_role not null default 'recepcion',
  nombre     text,
  telefono   text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Perfil del staff (1:1 con auth.users). Fuente de verdad del rol para RBAC.';

grant select, insert, update, delete on public.profiles to authenticated;

-- ───────────────────────── updated_at automático ─────────────────────────
create or replace function private.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function private.set_updated_at() from public;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- ─────────── Rol del usuario actual (para usar en políticas RLS) ───────────
-- SECURITY DEFINER: lee profiles sin disparar su propia RLS (evita recursión).
create or replace function private.user_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid());
$$;
revoke all on function private.user_role() from public;
grant execute on function private.user_role() to authenticated;

-- ───────────────────────── Crear perfil al registrarse ─────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, nombre)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nombre', new.email));
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── RLS en profiles ─────────────────────────
alter table public.profiles enable row level security;

-- Leer: el propio perfil, o todos si eres superadmin / coord_admin.
create policy "profiles_select"
  on public.profiles
  for select
  to authenticated
  using (
    (select auth.uid()) = id
    or private.user_role() in ('superadmin', 'coord_admin')
  );

-- Actualizar: solo el superadministrador (gestiona roles y datos del staff).
create policy "profiles_update_superadmin"
  on public.profiles
  for update
  to authenticated
  using (private.user_role() = 'superadmin')
  with check (private.user_role() = 'superadmin');

-- Insertar manualmente desde la app: solo superadmin
-- (el alta normal ocurre por trigger on_auth_user_created o vía Admin API).
create policy "profiles_insert_superadmin"
  on public.profiles
  for insert
  to authenticated
  with check (private.user_role() = 'superadmin');
