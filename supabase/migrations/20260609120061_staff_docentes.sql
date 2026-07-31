-- ============================================================================
-- 0061 · staff_docentes() — quién puede dictar una clase
-- ----------------------------------------------------------------------------
-- Hasta ahora "dicta clases" y "tiene rol profesor" eran lo mismo, y los pickers
-- de Clases / Cierre / Eventos / Academias filtraban por `role = 'profesor'`.
--
-- Se rompió con Willington: es COORDINADOR DEPORTIVO y además dicta las clases
-- de las 7 a.m., con salario fijo y comisión del 50% ya configurados en
-- `profesor_regla`. Al pasarlo a coordinador desapareció de los selectores, así
-- que sus clases no se le podían ni asignar — y sin clases asignadas, la
-- comisión se calculaba sobre nada.
--
-- El rol dice QUÉ VE la persona en la app; las reglas dicen CÓMO SE LE PAGA.
-- Son dos preguntas distintas y esta función responde la segunda.
--
-- Va como función nueva y no como parámetro extra de `staff_directorio` para no
-- tener que hacer DROP + CREATE de una firma que ya usan cinco pantallas (dejar
-- las dos firmas volvería ambigua la llamada desde PostgREST).
--
-- SECURITY DEFINER es imprescindible: `profesor_regla` guarda sueldos y
-- comisiones, así que recepción no puede leerla. La función la consulta por
-- dentro y hacia afuera devuelve solo id/nombre/rol/estado — ninguna cifra.
-- ============================================================================

create or replace function public.staff_docentes(
  p_solo_activos boolean default true
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
  'Quién puede dictar clases: rol profesor O con compensación configurada. Solo nombre/rol/estado, nunca cifras.';

notify pgrst, 'reload schema';
