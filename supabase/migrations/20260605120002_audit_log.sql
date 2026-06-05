-- ============================================================================
-- 0002 · Bitácora de auditoría — acciones sensibles
-- ============================================================================

create table public.audit_log (
  id         bigint generated always as identity primary key,
  actor_id   uuid references auth.users (id) on delete set null,
  action     text not null,
  entity     text not null,
  entity_id  text,
  before     jsonb,
  after      jsonb,
  created_at timestamptz not null default now()
);

comment on table public.audit_log is
  'Bitácora de acciones sensibles (descuentos, valor de clase, conciliación, roles).';

create index audit_log_created_at_idx on public.audit_log (created_at desc);
create index audit_log_entity_idx on public.audit_log (entity, entity_id);

grant select, insert on public.audit_log to authenticated;
alter table public.audit_log enable row level security;

-- Leer: solo superadministrador / coordinador administrativo.
create policy "audit_log_select_admin"
  on public.audit_log
  for select
  to authenticated
  using (private.user_role() in ('superadmin', 'coord_admin'));

-- Insertar: cualquier autenticado, pero solo a su propio nombre (actor no falsificable).
create policy "audit_log_insert_self"
  on public.audit_log
  for insert
  to authenticated
  with check (actor_id = (select auth.uid()));
