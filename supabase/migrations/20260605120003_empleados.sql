-- ============================================================================
-- 0003 · Empleados (M3) — datos de staff + valor de clase por profesor
-- ============================================================================

-- Datos adicionales del empleado en profiles.
alter table public.profiles
  add column documento text,
  add column activo boolean not null default true;

-- Historial del valor de clase por profesor (COP). El vigente = fila más reciente.
create table public.profesor_valor_clase (
  id            bigint generated always as identity primary key,
  profesor_id   uuid not null references public.profiles (id) on delete cascade,
  valor         integer not null check (valor >= 0),
  vigente_desde date not null default current_date,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);

comment on table public.profesor_valor_clase is
  'Historial del valor de clase por profesor (COP). El vigente es la fila más reciente por vigente_desde.';

create index profesor_valor_clase_profesor_idx
  on public.profesor_valor_clase (profesor_id, vigente_desde desc);

grant select, insert on public.profesor_valor_clase to authenticated;
alter table public.profesor_valor_clase enable row level security;

-- Leer: superadmin (E) + coord_admin (L), igual que el módulo "empleados".
create policy "valor_clase_select_admin"
  on public.profesor_valor_clase
  for select
  to authenticated
  using (private.user_role() in ('superadmin', 'coord_admin'));

-- Registrar un nuevo valor: solo superadmin, a su propio nombre.
create policy "valor_clase_insert_superadmin"
  on public.profesor_valor_clase
  for insert
  to authenticated
  with check (
    private.user_role() = 'superadmin'
    and created_by = (select auth.uid())
  );
