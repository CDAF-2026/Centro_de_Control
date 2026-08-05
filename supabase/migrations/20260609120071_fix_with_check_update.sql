-- ============================================================================
-- 0071 · Arreglo: a dos políticas de UPDATE les faltó el `with check`
-- ----------------------------------------------------------------------------
-- En 0070 se agregó `gestion_eventos` a `clientes_update` y `acudientes_update`
-- con `alter policy ... using (...)`, SIN tocar su `with check`. Y una política de
-- UPDATE tiene DOS mitades:
--   · `using`      → qué filas puedo tocar
--   · `with check` → cómo puede quedar la fila después
-- `alter policy` solo reemplaza la mitad que se le nombra y CONSERVA la otra, así
-- que el rol podía "ver" la fila para editarla y el guardado rebotaba con
-- "new row violates row-level security policy". Ojo: no da error al aplicar la
-- migración ni al leer `pg_policies` por encima — hay que mirar las dos columnas.
--
-- Las de `for all` (eventos, evento_gastos, cliente_miembros…) sí quedaron bien
-- porque ahí se escribieron las dos mitades.
-- ============================================================================

alter policy "clientes_update" on public.clientes
  using (private.user_role() in ('superadmin','coord_admin','recepcion','gestion_eventos'))
  with check (private.user_role() in ('superadmin','coord_admin','recepcion','gestion_eventos'));

alter policy "acudientes_update" on public.acudientes
  using (private.user_role() in ('superadmin','coord_admin','recepcion','gestion_eventos'))
  with check (private.user_role() in ('superadmin','coord_admin','recepcion','gestion_eventos'));
