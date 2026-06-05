-- ============================================================================
-- 0005 · Documentos del cliente (M2, H-06) — metadatos + bucket privado
-- ============================================================================

create type public.cliente_documento_tipo as enum (
  'consentimiento',
  'certificado_medico',
  'otro'
);

create table public.cliente_documentos (
  id            bigint generated always as identity primary key,
  cliente_id    bigint not null references public.clientes (id) on delete cascade,
  tipo          public.cliente_documento_tipo not null default 'otro',
  nombre_archivo text not null,
  storage_path  text not null,
  uploaded_by   uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);

create index cliente_documentos_cliente_idx on public.cliente_documentos (cliente_id);

grant select, insert, delete on public.cliente_documentos to authenticated;
alter table public.cliente_documentos enable row level security;

create policy "cliente_docs_meta_select" on public.cliente_documentos
  for select to authenticated
  using (private.user_role() in ('superadmin', 'coord_admin', 'coord_deportivo', 'recepcion'));

create policy "cliente_docs_meta_insert" on public.cliente_documentos
  for insert to authenticated
  with check (
    private.user_role() in ('superadmin', 'coord_admin', 'recepcion')
    and uploaded_by = (select auth.uid())
  );

create policy "cliente_docs_meta_delete" on public.cliente_documentos
  for delete to authenticated
  using (private.user_role() in ('superadmin', 'coord_admin', 'recepcion'));

-- Bucket privado para los archivos.
insert into storage.buckets (id, name, public)
values ('cliente-docs', 'cliente-docs', false)
on conflict (id) do nothing;

-- Policies de Storage (storage.objects) para el bucket.
create policy "cliente_docs_obj_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'cliente-docs'
    and private.user_role() in ('superadmin', 'coord_admin', 'coord_deportivo', 'recepcion')
  );

create policy "cliente_docs_obj_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'cliente-docs'
    and private.user_role() in ('superadmin', 'coord_admin', 'recepcion')
  );

create policy "cliente_docs_obj_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'cliente-docs'
    and private.user_role() in ('superadmin', 'coord_admin', 'recepcion')
  );

create policy "cliente_docs_obj_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'cliente-docs'
    and private.user_role() in ('superadmin', 'coord_admin', 'recepcion')
  );
