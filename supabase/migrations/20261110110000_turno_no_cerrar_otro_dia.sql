-- ============================================================================
-- Turnos · un turno olvidado ya NO se puede cerrar al día siguiente
-- ----------------------------------------------------------------------------
-- Decisión de Laura, 10-nov-2026.
--
-- QUÉ PASABA. "Un turno abierto aporta cero horas" solo protegía mientras el
-- turno siguiera abierto. Si alguien olvidaba cerrar, al día siguiente su
-- pantalla le seguía diciendo "Estás en turno" con el botón "Cerrar turno"; al
-- tocarlo, el turno quedaba cerrado con 24 horas o más y TODAS entraban al
-- reporte como trabajadas, casi todas como extra. Medido ese día sobre 219
-- turnos: 11 de más de 14 horas (el más largo, 480 h: veinte días), 6 de ellos
-- de octubre para acá, que es desde cuando el reporte se usa para pagar.
--
-- QUÉ CAMBIA.
--   · Cada turno pertenece a la JORNADA en que se abrió, y la jornada se corta
--     a las 4:00 a.m. (no a medianoche): un evento que se pase de las 12 se
--     sigue pudiendo cerrar. El club abre a las 6–7 a.m. y cierra a las 9 p.m.,
--     así que a las 4 a.m. no hay nadie trabajando ni llegando.
--   · Solo se puede cerrar (o marcar almuerzo en) el turno de la jornada de
--     HOY. Uno de una jornada anterior queda abierto: aporta cero horas, sale
--     en rojo en el reporte y el superadministrador le pone la salida real
--     desde "Corregir", que es para lo que existe esa pantalla.
--   · La persona NO queda trancada: inicia el turno de hoy con normalidad
--     aunque tenga uno viejo sin cerrar. Por eso el índice único pasa de "uno
--     abierto por persona" a "uno abierto por persona y jornada".
--
-- ⚠️ La hora de corte está en DOS sitios de la base, los dos en este archivo
-- (la función `private.turno_jornada` y la expresión del índice), y en uno de
-- la app: `CORTE_JORNADA_HORAS` en src/lib/turnos.ts, que decide qué turno
-- mostrar en "Mi turno" y qué es "en curso" en el reporte. Si se cambia, van
-- los tres. Hay una prueba que compara la función con la de la app.
--
-- ⚠️ El índice NO usa la función, a propósito: una función propia dentro de un
-- índice se ejecuta con los permisos de quien inserta, y las pruebas de render
-- siembran turnos con service_role, que no tiene por qué poder entrar al
-- esquema `private`. La expresión va con funciones del sistema.
--
-- No se tocan los turnos que ya quedaron cerrados con horas de más: esos los
-- corrige el superadministrador, con motivo y rastro.
-- ============================================================================

/**
 * La jornada a la que pertenece un instante: el día en Bogotá, corrido 4 horas.
 * Las 2:00 a.m. del martes todavía son la jornada del lunes.
 */
create or replace function private.turno_jornada(p_instante timestamptz)
returns date
language sql
immutable
set search_path = ''
as $$
  select ((p_instante at time zone 'America/Bogota') - interval '4 hours')::date
$$;
revoke all on function private.turno_jornada(timestamptz) from public;

-- Uno abierto por persona Y JORNADA (antes: uno por persona, a secas).
drop index if exists public.turno_abierto_uidx;
create unique index turno_abierto_uidx on public.turno (
  perfil_id,
  (((inicio_el at time zone 'America/Bogota') - interval '4 hours')::date)
) where fin_el is null;

/**
 * Implementación única de las cuatro marcaciones (reemplaza la de 0080).
 * Lo nuevo: "el turno abierto" es el de la jornada de HOY.
 */
create or replace function private.turno_marcar(
  p_perfil    uuid,
  p_accion    text,
  p_foto_path text,
  p_origen    text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ahora timestamptz := date_trunc('minute', now());
  v_hoy   date := private.turno_jornada(now());
  v_turno bigint;
  v_pausa bigint;
  v_viejo timestamptz;
begin
  -- A lo sumo uno: lo garantiza `turno_abierto_uidx`.
  select id into v_turno
    from public.turno
   where perfil_id = p_perfil
     and fin_el is null
     and private.turno_jornada(inicio_el) = v_hoy;

  if p_accion = 'entrada' then
    if v_turno is not null then
      raise exception 'Ya tienes un turno abierto. Ciérralo antes de iniciar otro.';
    end if;
    if p_foto_path is null then
      raise exception 'Falta la foto de entrada.';
    end if;
    -- Un turno viejo sin cerrar NO impide iniciar el de hoy: ese lo arregla el
    -- superadministrador, y la persona tiene que poder seguir marcando.
    insert into public.turno (perfil_id, inicio_el, foto_inicio_path, origen)
    values (p_perfil, v_ahora, p_foto_path, p_origen)
    returning id into v_turno;
    return v_turno;
  end if;

  if v_turno is null then
    -- Se distingue el olvido del "nunca entró": se arreglan distinto, y un
    -- "No tienes un turno abierto" a quien ve su turno de ayer en la memoria
    -- lo dejaría sin saber qué hacer.
    select max(inicio_el) into v_viejo
      from public.turno
     where perfil_id = p_perfil
       and fin_el is null
       and private.turno_jornada(inicio_el) < v_hoy;
    if v_viejo is not null then
      raise exception
        'Tu turno del % quedó sin cerrar y ya no se puede cerrar desde aquí. Avísale al administrador a qué hora saliste e inicia el turno de hoy.',
        to_char(v_viejo at time zone 'America/Bogota', 'DD/MM/YYYY');
    end if;
    raise exception 'No tienes un turno abierto.';
  end if;

  select id into v_pausa
    from public.turno_pausa
   where turno_id = v_turno and fin_el is null;

  if p_accion = 'pausa_inicio' then
    if v_pausa is not null then
      raise exception 'Ya marcaste tu salida a almorzar.';
    end if;
    insert into public.turno_pausa (turno_id, inicio_el) values (v_turno, v_ahora);
    return v_turno;

  elsif p_accion = 'pausa_fin' then
    if v_pausa is null then
      raise exception 'No tienes una pausa abierta.';
    end if;
    update public.turno_pausa set fin_el = v_ahora where id = v_pausa;
    return v_turno;

  elsif p_accion = 'salida' then
    -- ⚠️ Se bloquea a propósito cerrar con el almuerzo abierto (ver 0080).
    if v_pausa is not null then
      raise exception 'Primero marca tu regreso del almuerzo.';
    end if;
    if p_foto_path is null then
      raise exception 'Falta la foto de salida.';
    end if;
    update public.turno
       set fin_el = v_ahora, foto_fin_path = p_foto_path
     where id = v_turno;
    return v_turno;
  end if;

  raise exception 'Acción desconocida: %', p_accion;
end;
$$;
revoke all on function private.turno_marcar(uuid, text, text, text) from public;

/**
 * Lista del quiósco. Misma salida que antes; lo único que cambia es que el
 * turno que muestra es el de la jornada de HOY. Sin ese filtro, alguien con un
 * turno viejo abierto y el de hoy saldría DOS veces en la pantalla.
 */
create or replace function public.quiosco_estado()
returns table (
  perfil_id     uuid,
  nombre        text,
  turno_id      bigint,
  inicio_el     timestamptz,
  pausa_abierta boolean,
  tiene_pin     boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.user_role() not in ('quiosco', 'superadmin') then
    raise exception 'Esta pantalla solo funciona en el equipo de recepción.';
  end if;
  return query
    select p.id,
           coalesce(p.nombre, '(sin nombre)'),
           t.id,
           t.inicio_el,
           exists (select 1 from public.turno_pausa pa where pa.turno_id = t.id and pa.fin_el is null),
           exists (select 1 from public.turno_pin pin where pin.perfil_id = p.id)
      from public.profiles p
      left join public.turno t
             on t.perfil_id = p.id
            and t.fin_el is null
            and private.turno_jornada(t.inicio_el) = private.turno_jornada(now())
     where p.activo and p.marca_turno
     order by coalesce(p.nombre, '');
end;
$$;
revoke all on function public.quiosco_estado() from public;
grant execute on function public.quiosco_estado() to authenticated;
