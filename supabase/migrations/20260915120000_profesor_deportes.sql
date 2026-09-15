-- ============================================================================
-- 0089 · profiles.deportes — qué deporte dicta cada profesor
-- ----------------------------------------------------------------------------
-- El club crea clases en EasyCancha sin profesor (el profe es nuevo y aún no
-- existe, o simplemente se les olvida). Esas clases se materializan con
-- `profesor_id = null` y ahí se quedan: la liquidación las SALTA en silencio
-- (`if (!c.profesor_id) continue`), así que la clase se dictó, se cobró, y a
-- nadie se le pagó — sin un solo mensaje de error.
--
-- La solución es un select de profesor en el modal de /clases, y ese select
-- debe ofrecer los del DEPORTE de la clase: si es de pádel, los de pádel. Pero
-- ese dato NO EXISTÍA en ninguna parte — `profiles` no sabe nada de deportes.
-- Esta migración lo crea.
--
-- ¿Por qué un arreglo y no una columna suelta? Porque hay quien dicta los dos
-- (mismo patrón que `clientes.deportes` y `cliente_miembros.deportes`, que ya
-- usan `deporte[]`). Vacío = "sin marcar": esa persona sigue apareciendo en el
-- selector, en un grupo aparte. Esconderla sería el fallo silencioso de
-- siempre — un profesor que no existe en la lista y nadie sabe por qué.
-- ============================================================================

alter table public.profiles
  add column if not exists deportes public.deporte[] not null default '{}';

comment on column public.profiles.deportes is
  'Deportes que dicta. Vacío = sin marcar (sale aparte en los selectores, nunca se esconde). Solo lo mueve el superadministrador.';

-- ----------------------------------------------------------------------------
-- El deporte lo pone SOLO el superadministrador
-- ----------------------------------------------------------------------------
-- Va al mismo trigger que `role`, `activo` y `marca_turno`, y por la misma
-- razón: `profiles_update_self` deja que cada quien edite su propio perfil, así
-- que sin candado un profesor podría quitarse el deporte desde "Mi perfil" y
-- desaparecer del selector de su propia cancha. No es un dato suyo: es
-- configuración de quién puede dictar qué.
create or replace function private.profiles_blindar_rol()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and private.user_role() is distinct from 'superadmin' then
    if new.role is distinct from old.role then
      raise exception 'Solo el superadministrador puede cambiar el rol.';
    end if;
    if new.activo is distinct from old.activo then
      raise exception 'Solo el superadministrador puede activar o desactivar una cuenta.';
    end if;
    if new.marca_turno is distinct from old.marca_turno then
      raise exception 'Solo el superadministrador puede cambiar quién registra turnos.';
    end if;
    if new.deportes is distinct from old.deportes then
      raise exception 'Solo el superadministrador puede cambiar los deportes que dicta.';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.profiles_blindar_rol() from public;

-- ----------------------------------------------------------------------------
-- staff_docentes ahora devuelve el deporte
-- ----------------------------------------------------------------------------
-- DROP + CREATE obligatorio: agregar una columna de salida cambia el tipo de
-- retorno y `create or replace` lo rechaza con "cannot change return type of
-- existing function". El cambio es aditivo para quien ya la usa (lee id/nombre/
-- activo), así que los cinco pickers siguen funcionando igual.
drop function if exists public.staff_docentes(boolean);

create function public.staff_docentes(
  p_solo_activos boolean default true
)
returns table (id uuid, nombre text, role public.app_role, activo boolean, deportes public.deporte[])
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.nombre, p.role, p.activo, p.deportes
  from public.profiles p
  where (select auth.uid()) is not null
    and (not p_solo_activos or p.activo)
    and (
      p.role = 'profesor'
      -- Cualquier otro rol que tenga con qué pagársele por dictar.
      or exists (
        select 1 from public.profesor_regla r
        where r.profesor_id = p.id and r.activo
      )
      or exists (
        select 1 from public.profesor_compensacion c
        where c.profesor_id = p.id
      )
    )
  order by p.nombre nulls last;
$$;

revoke all on function public.staff_docentes(boolean) from public, anon;
grant execute on function public.staff_docentes(boolean) to authenticated;

comment on function public.staff_docentes(boolean) is
  'Quién puede dictar clases: rol profesor O con compensación configurada. Devuelve nombre/rol/estado/deportes, nunca cifras.';

notify pgrst, 'reload schema';
