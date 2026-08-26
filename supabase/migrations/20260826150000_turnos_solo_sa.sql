-- ============================================================================
-- 0083 · El registro de horas es SOLO del superadministrador
-- ----------------------------------------------------------------------------
-- Decisión de Laura (26-ago-2026): el empleado no ve cuántas horas lleva. Su
-- pantalla marca entrada y salida y nada más — ni el acumulado de la semana, ni
-- la clasificación del día, ni el histórico de turnos.
--
-- Se hace en la BASE y no solo en la pantalla. Es la lección que este proyecto ya
-- aprendió tres veces (el dashboard, `cerrarClase`, `/config`): quitar algo del
-- menú lo esconde, no lo cierra — cualquiera con la sesión abierta podía pedir
-- sus turnos por la API igual.
--
-- Lo que SÍ sigue viendo de sí mismo: su turno ABIERTO, y solo mientras lo está.
-- No es un capricho, es lo mínimo para que la pantalla funcione: sin eso no se
-- puede saber si toca ofrecer "Iniciar" o "Cerrar", ni si hay un almuerzo sin
-- regreso. En cuanto cierra el turno, la fila deja de ser suya de ver.
--
-- ⚠️ `turnos_horas` y `turnos_listar` NO se tocan: son SECURITY INVOKER a
-- propósito, así que este cambio de política las alcanza solas. Un empleado que
-- las llame recibe, como mucho, su propio turno abierto — que aporta cero horas.
-- Justamente por esto no hay un segundo guardia escrito a mano que se pueda
-- quedar desactualizado.
-- ============================================================================

drop policy "turno_select" on public.turno;
create policy "turno_select" on public.turno
  for select to authenticated
  using (
    private.user_role() = 'superadmin'
    or (perfil_id = (select auth.uid()) and fin_el is null)
  );

drop policy "turno_pausa_select" on public.turno_pausa;
create policy "turno_pausa_select" on public.turno_pausa
  for select to authenticated
  using (exists (
    select 1 from public.turno t
     where t.id = turno_pausa.turno_id
       and (
         private.user_role() = 'superadmin'
         or (t.perfil_id = (select auth.uid()) and t.fin_el is null)
       )
  ));
