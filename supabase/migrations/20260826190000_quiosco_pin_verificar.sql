-- ============================================================================
-- 0085 · Verificar el PIN sin marcar todavía
-- ----------------------------------------------------------------------------
-- El quiósco pide el PIN y DESPUÉS abre la cámara. Con solo `quiosco_marcar`
-- —que valida y marca en el mismo paso— un PIN equivocado se descubriría
-- después de tomarse la foto: confuso para la persona ("¿por qué me tomó la
-- foto si el PIN estaba mal?") y encima deja el archivo subido para nada.
--
-- Se parte en dos, pero con UNA sola implementación de la comprobación
-- (`private.quiosco_pin_check`), que es la regla de este módulo: dos copias de
-- la misma validación se desincronizan. `quiosco_marcar` la vuelve a llamar —el
-- navegador no se salta nada— y `quiosco_pin_verificar` la usa para fallar
-- temprano.
--
-- ⚠️ Sigue devolviendo un ESTADO y no una excepción, por lo de siempre: una
-- excepción revertiría el `update` que suma el intento fallido y el bloqueo a
-- los 5 intentos nunca se activaría.
-- ============================================================================

create or replace function private.quiosco_pin_check(p_perfil uuid, p_pin text)
returns table (ok boolean, mensaje text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pin      public.turno_pin%rowtype;
  v_restan   int;
begin
  select * into v_pin from public.turno_pin where perfil_id = p_perfil;

  if v_pin.perfil_id is null then
    return query select false, 'Todavía no tienes PIN. Pídeselo al administrador.'::text;
    return;
  end if;

  if v_pin.bloqueado_hasta is not null and v_pin.bloqueado_hasta > now() then
    return query select false, 'PIN bloqueado por intentos fallidos. Intenta en unos minutos.'::text;
    return;
  end if;

  if v_pin.pin_hash is distinct from extensions.crypt(p_pin, v_pin.pin_hash) then
    update public.turno_pin
       set intentos = intentos + 1,
           bloqueado_hasta = case when intentos + 1 >= 5 then now() + interval '15 minutes' end
     where perfil_id = p_perfil;

    -- Se dice cuántos intentos quedan ANTES de bloquear: que a alguien se le
    -- cierre la puerta sin haber entendido por qué es peor que el PIN malo.
    v_restan := 5 - (v_pin.intentos + 1);
    return query select false,
      case when v_restan <= 0 then 'PIN bloqueado 15 minutos por intentos fallidos.'
           when v_restan = 1  then 'PIN incorrecto. Te queda 1 intento.'
           else format('PIN incorrecto. Te quedan %s intentos.', v_restan) end::text;
    return;
  end if;

  update public.turno_pin set intentos = 0, bloqueado_hasta = null where perfil_id = p_perfil;
  return query select true, null::text;
end;
$$;
revoke all on function private.quiosco_pin_check(uuid, text) from public;

/** Comprueba el PIN sin marcar nada. Lo usa el quiósco antes de abrir la cámara. */
create or replace function public.quiosco_pin_verificar(p_perfil uuid, p_pin text)
returns table (ok boolean, mensaje text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.user_role() not in ('quiosco', 'superadmin') then
    raise exception 'Esta pantalla solo funciona en el equipo de recepción.';
  end if;
  if not exists (select 1 from public.profiles where id = p_perfil and activo and marca_turno) then
    raise exception 'Esa persona no registra turnos.';
  end if;
  return query select * from private.quiosco_pin_check(p_perfil, p_pin);
end;
$$;
revoke all on function public.quiosco_pin_verificar(uuid, text) from public;
grant execute on function public.quiosco_pin_verificar(uuid, text) to authenticated;

-- `quiosco_marcar` pasa a apoyarse en la misma comprobación, en vez de repetirla.
create or replace function public.quiosco_marcar(
  p_perfil    uuid,
  p_pin       text,
  p_accion    text,
  p_foto_path text default null
)
returns table (ok boolean, mensaje text, turno_id bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_check record;
begin
  if private.user_role() not in ('quiosco', 'superadmin') then
    raise exception 'Esta pantalla solo funciona en el equipo de recepción.';
  end if;
  if not exists (select 1 from public.profiles where id = p_perfil and activo and marca_turno) then
    raise exception 'Esa persona no registra turnos.';
  end if;

  select * into v_check from private.quiosco_pin_check(p_perfil, p_pin);
  if not v_check.ok then
    return query select false, v_check.mensaje, null::bigint;
    return;
  end if;

  return query select true, null::text, private.turno_marcar(p_perfil, p_accion, p_foto_path, 'quiosco');
end;
$$;
revoke all on function public.quiosco_marcar(uuid, text, text, text) from public;
grant execute on function public.quiosco_marcar(uuid, text, text, text) to authenticated;
