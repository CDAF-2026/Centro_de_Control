-- Pausar/reactivar academias: SOLO el superadministrador (23-sep-2026, Laura).
-- La pantalla y la acción ya lo exigen; esto lo hace cumplir la base, porque el
-- guardia de la página no protege la tabla (lección repetida del proyecto).
-- Leer la pausa sigue abierto a todo el staff: el aviso de "en pausa" tiene que
-- verlo quien abre Cierre, justo para notar si alguien olvidó reactivar.
begin;
drop policy if exists academia_pausa_write on public.academia_pausa;
create policy academia_pausa_write on public.academia_pausa for all to authenticated
  using      (private.user_role() = 'superadmin'::public.app_role)
  with check (private.user_role() = 'superadmin'::public.app_role);
commit;
