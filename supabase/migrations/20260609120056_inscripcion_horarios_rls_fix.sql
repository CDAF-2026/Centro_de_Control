-- Corrige las políticas de `inscripcion_horarios` para que sigan el patrón del
-- proyecto y los mismos roles que `inscripciones` (son el mismo dato, partido).
--
-- Lo que estaba mal en 0054:
--   1. Usaba una subconsulta a `public.profiles` en vez de `private.user_role()`.
--      Todas las demás políticas usan el helper, y leer `profiles` desde una
--      política es justo lo que `profiles_select` restringe (solo el propio
--      perfil), así que era frágil además de inconsistente.
--   2. El SELECT era `using (true)`: cualquier autenticado podía leer los
--      horarios, cuando `inscripciones` los limita al staff.
drop policy if exists inscripcion_horarios_select on public.inscripcion_horarios;
drop policy if exists inscripcion_horarios_write on public.inscripcion_horarios;

-- Leer: el mismo staff que puede ver las inscripciones (profesor incluido: los
-- necesita para tomar asistencia).
create policy "inscripcion_horarios_select" on public.inscripcion_horarios for select to authenticated
  using (private.user_role() in ('superadmin', 'coord_admin', 'coord_deportivo', 'recepcion', 'profesor'));

-- Escribir: quien inscribe.
create policy "inscripcion_horarios_write" on public.inscripcion_horarios for all to authenticated
  using (private.user_role() in ('superadmin', 'coord_admin', 'coord_deportivo', 'recepcion'))
  with check (private.user_role() in ('superadmin', 'coord_admin', 'coord_deportivo', 'recepcion'));
