-- ============================================================================
-- 0088 · El coordinador administrativo VE el reporte de horas (pero no corrige)
-- ----------------------------------------------------------------------------
-- Decisión de Laura, 9-sep-2026. Antes el reporte era solo del superadministrador
-- (migración 0083); ahora el coordinador administrativo también lo consulta,
-- fotos incluidas — pero **corregir sigue siendo solo del superadministrador**.
--
-- Se toca la BASE y no solo la matriz de la app, que es la lección que este
-- proyecto ya aprendió con eventos (0069): cambiar `PERMISSIONS` deja pasar a la
-- pantalla, pero si la política no lo acompaña la persona ve el módulo con CERO
-- filas — y en este caso ni siquiera daría error, saldría un reporte en blanco.
--
-- Corregir no necesita nada aquí: `turno_ajustar`, `turno_crear_manual`,
-- `turno_eliminar`, `turno_pausa_fijar` y `turno_pausa_eliminar` pasan todas por
-- `private.turno_exige_sa()`, que sigue exigiendo superadministrador. La lectura
-- se abre; la escritura no se mueve.
--
-- ⚠️ CONSECUENCIA CONOCIDA Y ACEPTADA: **Juan Fernando Gaviria es coordinador
-- administrativo Y uno de los cuatro que marca turno.** Con esto ve su propio
-- acumulado y el de sus compañeros, que es justo lo que 0083 le cerró a los
-- empleados. Se le advirtió a Laura y decidió seguir: los permisos de esta app
-- son por ROL, no por persona, así que no hay forma de dárselo a Sebastián y no
-- a Juan sin inventar excepciones por usuario (descartado desde 0068).
--
-- 💡 `turnos_horas` y `turnos_listar` no se tocan: son SECURITY INVOKER a
-- propósito, así que este cambio de política las alcanza solas. Es la tercera
-- vez que esa decisión ahorra trabajo.
-- ============================================================================

-- ─────────────────── Los turnos y sus pausas ───────────────────
-- Se hace DROP + CREATE y no `alter policy ... using`: son de SELECT y no tienen
-- `with check`, así que el `alter` sería seguro aquí — pero reescribirlas
-- enteras deja la condición completa a la vista, que es lo que se quiere poder
-- leer de un vistazo en la tabla de la nómina.
drop policy "turno_select" on public.turno;
create policy "turno_select" on public.turno
  for select to authenticated
  using (
    private.user_role() in ('superadmin', 'coord_admin')
    or (perfil_id = (select auth.uid()) and fin_el is null)
  );

drop policy "turno_pausa_select" on public.turno_pausa;
create policy "turno_pausa_select" on public.turno_pausa
  for select to authenticated
  using (exists (
    select 1 from public.turno t
     where t.id = turno_pausa.turno_id
       and (
         private.user_role() in ('superadmin', 'coord_admin')
         or (t.perfil_id = (select auth.uid()) and t.fin_el is null)
       )
  ));

-- ─────────────────── Las fotos ───────────────────
-- Laura decidió que también las vea (9-sep-2026). Son dato sensible (Ley 1581),
-- así que queda anotado que ahora son DOS roles los que ven caras, no uno.
-- Borrarlas sigue siendo solo del superadministrador: `turnos_obj_delete` no se
-- toca.
drop policy "turnos_obj_select" on storage.objects;
create policy "turnos_obj_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'turnos'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or private.user_role() in ('superadmin', 'coord_admin')
    )
  );
