-- ============================================================================
-- 0070 · `gestion_eventos` también administra clientes (sin su plata)
-- ----------------------------------------------------------------------------
-- Al inscribir a alguien en un torneo hay que poder mirar si la persona ya está
-- en el club y, si no, crearla. Con solo lectura (0069) el flujo se rompía justo
-- ahí: el participante nuevo solo podía entrar como "externo", que no engancha con
-- la ficha ni con las facturas de Siigo.
--
-- Se le da lo MISMO que a recepción sobre las tablas del cliente. Lo que NO se le
-- da es la situación financiera: ese bloque de la ficha lo tapa el permiso de
-- aplicación `cliente_finanzas` (sigue en N), igual que ya pasa con el coordinador
-- deportivo. Aquí no hay política que cambiar porque la plata del cliente sale de
-- `siigo_facturas`, cuya lectura ya la necesita para el P&G de sus eventos.
-- ============================================================================

-- ── Ficha del cliente ──
alter policy "clientes_insert" on public.clientes
  with check (private.user_role() in ('superadmin','coord_admin','recepcion','gestion_eventos'));
alter policy "clientes_update" on public.clientes
  using (private.user_role() in ('superadmin','coord_admin','recepcion','gestion_eventos'));

-- ── Deportistas de la ficha (hermanos). El titular lo crea el trigger de 0066,
--    pero agregar un hermano y corregir nombres pasa por aquí. ──
alter policy "cliente_miembros_select" on public.cliente_miembros
  using (private.user_role() in ('superadmin','coord_admin','coord_deportivo','recepcion','profesor','gestion_eventos'));
alter policy "cliente_miembros_write" on public.cliente_miembros
  using (private.user_role() in ('superadmin','coord_admin','recepcion','gestion_eventos'))
  with check (private.user_role() in ('superadmin','coord_admin','recepcion','gestion_eventos'));

-- ── Acudientes ──
alter policy "acudientes_select" on public.acudientes
  using (private.user_role() in ('superadmin','coord_admin','coord_deportivo','recepcion','gestion_eventos'));
alter policy "acudientes_insert" on public.acudientes
  with check (private.user_role() in ('superadmin','coord_admin','recepcion','gestion_eventos'));
alter policy "acudientes_update" on public.acudientes
  using (private.user_role() in ('superadmin','coord_admin','recepcion','gestion_eventos'));

-- ── Documentos del cliente (metadatos + archivos en el bucket privado) ──
alter policy "cliente_docs_meta_select" on public.cliente_documentos
  using (private.user_role() in ('superadmin','coord_admin','coord_deportivo','recepcion','gestion_eventos'));
alter policy "cliente_docs_meta_insert" on public.cliente_documentos
  with check (private.user_role() in ('superadmin','coord_admin','recepcion','gestion_eventos')
              and uploaded_by = (select auth.uid()));
alter policy "cliente_docs_meta_delete" on public.cliente_documentos
  using (private.user_role() in ('superadmin','coord_admin','recepcion','gestion_eventos'));

alter policy "cliente_docs_obj_select" on storage.objects
  using (bucket_id = 'cliente-docs' and private.user_role() in ('superadmin','coord_admin','coord_deportivo','recepcion','gestion_eventos'));
alter policy "cliente_docs_obj_insert" on storage.objects
  with check (bucket_id = 'cliente-docs' and private.user_role() in ('superadmin','coord_admin','recepcion','gestion_eventos'));
alter policy "cliente_docs_obj_update" on storage.objects
  using (bucket_id = 'cliente-docs' and private.user_role() in ('superadmin','coord_admin','recepcion','gestion_eventos'));
alter policy "cliente_docs_obj_delete" on storage.objects
  using (bucket_id = 'cliente-docs' and private.user_role() in ('superadmin','coord_admin','recepcion','gestion_eventos'));
