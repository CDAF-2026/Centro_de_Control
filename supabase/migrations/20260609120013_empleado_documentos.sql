-- 0013 · Documentos del empleado (contrato, etc.) — metadatos + bucket privado.

create type public.empleado_documento_tipo as enum ('contrato', 'hoja_vida', 'otro');

create table public.empleado_documentos (
  id             bigint generated always as identity primary key,
  empleado_id    uuid not null references public.profiles (id) on delete cascade,
  tipo           public.empleado_documento_tipo not null default 'contrato',
  nombre_archivo text not null,
  storage_path   text not null,
  uploaded_by    uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now()
);

create index empleado_documentos_empleado_idx on public.empleado_documentos (empleado_id);

grant select, insert, delete on public.empleado_documentos to authenticated;
alter table public.empleado_documentos enable row level security;

create policy "empleado_docs_meta_select" on public.empleado_documentos
  for select to authenticated
  using (private.user_role() in ('superadmin', 'coord_admin'));

create policy "empleado_docs_meta_insert" on public.empleado_documentos
  for insert to authenticated
  with check (private.user_role() in ('superadmin', 'coord_admin') and uploaded_by = (select auth.uid()));

create policy "empleado_docs_meta_delete" on public.empleado_documentos
  for delete to authenticated
  using (private.user_role() in ('superadmin', 'coord_admin'));

-- Bucket privado para los archivos de empleados.
insert into storage.buckets (id, name, public)
values ('empleado-docs', 'empleado-docs', false)
on conflict (id) do nothing;

create policy "empleado_docs_obj_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'empleado-docs' and private.user_role() in ('superadmin', 'coord_admin'));

create policy "empleado_docs_obj_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'empleado-docs' and private.user_role() in ('superadmin', 'coord_admin'));

create policy "empleado_docs_obj_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'empleado-docs' and private.user_role() in ('superadmin', 'coord_admin'));

create policy "empleado_docs_obj_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'empleado-docs' and private.user_role() in ('superadmin', 'coord_admin'));
