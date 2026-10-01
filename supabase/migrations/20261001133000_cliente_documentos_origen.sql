-- ============================================================================
-- cliente_documentos sabe de qué niño es cada archivo y de dónde salió (Fase 1)
-- ----------------------------------------------------------------------------
-- Un documento colgaba solo de la ficha familiar: con dos hermanos no se sabía
-- de cuál era el consentimiento (R9 del plan). Y el PDF de una firma vive en
-- OTRO bucket (`consentimientos`, de solo escritura) que el personal no puede
-- borrar: la fila necesita decir en qué bucket está y que la generó una firma.
--
-- Borrar un documento de origen `firma_digital` se rechaza en la BASE (trigger),
-- no solo en la pantalla: es evidencia. Para retirarlo se anula la firma con
-- motivo (`consentimiento_anular`).
-- ============================================================================

alter table public.cliente_documentos
  add column miembro_id bigint references public.cliente_miembros (id) on delete set null,
  add column bucket     text not null default 'cliente-docs',
  add column origen     public.documento_origen not null default 'subido';

create index cliente_documentos_miembro_idx on public.cliente_documentos (miembro_id);

comment on column public.cliente_documentos.miembro_id is 'De qué persona de la ficha es el documento (null = de la familia).';
comment on column public.cliente_documentos.bucket is 'Bucket de Storage donde vive storage_path. Los de firma_digital están en `consentimientos`.';

create or replace function private.cliente_documentos_proteger_firma()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.origen = 'firma_digital' then
    raise exception 'Este documento es la evidencia de una firma y no se puede borrar. Anula la firma con motivo.'
      using errcode = 'P0001';
  end if;
  return old;
end;
$$;

create trigger cliente_documentos_proteger_firma
  before delete on public.cliente_documentos
  for each row execute function private.cliente_documentos_proteger_firma();
