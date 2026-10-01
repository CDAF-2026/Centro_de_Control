-- ============================================================================
-- Bucket `consentimientos` · evidencia de solo escritura (Fase 1, 1-oct-2026)
-- ----------------------------------------------------------------------------
-- Aquí quedan el PDF firmado y la imagen de la firma: `<firma_uuid>/consentimiento.pdf`
-- y `<firma_uuid>/firma.png`. Privado, como `cliente-docs`, pero con una
-- diferencia a propósito: NADIE con sesión puede subir, cambiar ni borrar. Solo
-- el servidor (service_role) escribe, una vez. Leer sí: los mismos roles que ven
-- los documentos del cliente, con enlace firmado.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('consentimientos', 'consentimientos', false)
on conflict (id) do nothing;

create policy "consentimientos_obj_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'consentimientos'
    and private.user_role() in ('superadmin', 'coord_admin', 'coord_deportivo', 'recepcion', 'gestion_eventos')
  );
-- Sin insert/update/delete para authenticated: es evidencia.
