-- ============================================================================
-- 0046 · staff_directorio() con parámetros — arregla los pickers de profesor
-- ----------------------------------------------------------------------------
-- `profiles_select` (0001) solo deja ver el propio perfil salvo a SA/CA. Como
-- hasta ahora únicamente entraba la cuenta superadmin, nadie había notado que
-- para recepción / coord. deportivo / profesor los selectores de profesor de
-- Clases, Cierre, Eventos y Academias salen VACÍOS, y los nombres de las clases
-- históricas salen como "—".
--
-- Se resuelve leyendo por esta función (que expone solo nombre, rol y estado —
-- nunca documento ni teléfono) en vez de abrir la política de `profiles`.
-- Abrir la tabla expondría cédulas entre compañeros; quitar columnas por GRANT
-- afectaría también a los administradores, que sí las necesitan en /empleados.
--
-- Tres usos distintos, de ahí los parámetros:
--   · elegir profesor  → p_solo_activos = true,  p_role = 'profesor'
--   · filtrar por profe → p_solo_activos = false, p_role = 'profesor'
--     (quien ya no está pudo dar clases antes y debe seguir apareciendo)
--   · resolver nombres → p_solo_activos = false, p_role = null
-- ============================================================================

drop function if exists public.staff_directorio();

create or replace function public.staff_directorio(
  p_solo_activos boolean default true,
  p_role public.app_role default null
)
returns table (id uuid, nombre text, role public.app_role, activo boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.nombre, p.role, p.activo
  from public.profiles p
  where (select auth.uid()) is not null
    and (not p_solo_activos or p.activo)
    and (p_role is null or p.role = p_role)
  order by p.nombre nulls last;
$$;

revoke all on function public.staff_directorio(boolean, public.app_role) from public, anon;
grant execute on function public.staff_directorio(boolean, public.app_role) to authenticated;

comment on function public.staff_directorio(boolean, public.app_role) is
  'Directorio del staff para pickers y nombres. Solo nombre/rol/estado: nunca documento ni teléfono.';

notify pgrst, 'reload schema';
