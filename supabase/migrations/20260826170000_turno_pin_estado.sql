-- ============================================================================
-- 0084 · Saber (y quitar) el PIN del quiósco desde la ficha del empleado
-- ----------------------------------------------------------------------------
-- `turno_pin` no la lee NADIE, ni el superadministrador (migración 0082): un PIN
-- de 4 dígitos son 10.000 combinaciones y un hash filtrado se revienta en
-- milisegundos. Pero la ficha del empleado necesita responder una pregunta que
-- no revela nada: **¿esta persona ya tiene PIN?**
--
-- De ahí estas dos funciones. Devuelven y borran, nunca leen el hash.
-- ============================================================================

/** ¿Tiene PIN asignado? Solo el superadministrador puede preguntarlo. */
create or replace function public.turno_pin_estado(p_perfil uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if private.user_role() is distinct from 'superadmin' then
    raise exception 'Solo el superadministrador puede consultar el PIN.';
  end if;
  return exists (select 1 from public.turno_pin where perfil_id = p_perfil);
end;
$$;
revoke all on function public.turno_pin_estado(uuid) from public;
grant execute on function public.turno_pin_estado(uuid) to authenticated;

/**
 * Quita el PIN. Sin PIN la persona no puede marcar en el PC de recepción, pero
 * sigue marcando desde su celular con normalidad: son dos puertas distintas.
 */
create or replace function public.turno_pin_borrar(p_perfil uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.turno_exige_sa();
  delete from public.turno_pin where perfil_id = p_perfil;

  insert into public.audit_log (actor_id, action, entity, entity_id, after)
  values ((select auth.uid()), 'turno.pin_borrar', 'profiles', p_perfil::text,
          jsonb_build_object('pin', 'borrado'));
end;
$$;
revoke all on function public.turno_pin_borrar(uuid) from public;
grant execute on function public.turno_pin_borrar(uuid) to authenticated;
