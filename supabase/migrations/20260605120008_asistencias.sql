-- ============================================================================
-- 0008 · Sprint 3 — Asistencias y cierre de clase (circuito anti-fuga)
-- ============================================================================

alter table public.clases
  add column registrada_por uuid references auth.users (id) on delete set null;

create table public.asistencias (
  id             bigint generated always as identity primary key,
  clase_id       bigint not null references public.clases (id) on delete cascade,
  cliente_id     bigint not null references public.clientes (id) on delete cascade,
  presente       boolean not null default true,
  registrado_por uuid references auth.users (id) on delete set null,
  registrado_at  timestamptz not null default now(),
  unique (clase_id, cliente_id)
);
create index asistencias_clase_idx on public.asistencias (clase_id);

grant select, insert, update on public.asistencias to authenticated;
alter table public.asistencias enable row level security;

create policy "asistencias_select" on public.asistencias
  for select to authenticated
  using (private.user_role() in ('superadmin', 'coord_admin', 'coord_deportivo', 'recepcion', 'profesor'));

-- Escribir: SA/CA/CD, o el profesor dueño de la clase.
create policy "asistencias_write" on public.asistencias
  for all to authenticated
  using (
    private.user_role() in ('superadmin', 'coord_admin', 'coord_deportivo')
    or exists (
      select 1 from public.clases c
      where c.id = asistencias.clase_id and c.profesor_id = (select auth.uid())
    )
  )
  with check (
    private.user_role() in ('superadmin', 'coord_admin', 'coord_deportivo')
    or exists (
      select 1 from public.clases c
      where c.id = asistencias.clase_id and c.profesor_id = (select auth.uid())
    )
  );

-- El profesor puede cerrar/actualizar SUS propias clases (además de SA/CA/CD/RC).
create policy "clases_update_profesor" on public.clases
  for update to authenticated
  using (profesor_id = (select auth.uid()))
  with check (profesor_id = (select auth.uid()));
