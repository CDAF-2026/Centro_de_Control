-- ============================================================================
-- 0086 · Qué fotos de turno ya cumplieron el mes
-- ----------------------------------------------------------------------------
-- La foto de una cara es dato sensible (Ley 1581) y Laura decidió guardarlas un
-- mes. Se borra LA FOTO; **el registro del turno se conserva siempre**, porque
-- es la prueba de nómina.
--
-- La decisión de QUÉ borrar vive aquí, en SQL, y no dentro de la tarea que corre
-- en el servidor: así se puede probar de verdad. La tarea solo hace lo que aquí
-- no se puede — borrar el archivo del almacenamiento.
--
-- ⚠️ EL ORDEN IMPORTA y por eso son dos funciones y no una:
--   1. `turno_fotos_vencidas` dice cuáles;
--   2. la tarea las borra del almacenamiento;
--   3. `turno_fotos_olvidar` limpia las rutas de la base.
-- Si se hiciera al revés —olvidar primero— y el borrado fallara, esos archivos
-- quedarían huérfanos PARA SIEMPRE: nadie volvería a saber que existen. Así, si
-- el paso 3 falla, la corrida siguiente los vuelve a ver, intenta borrarlos (ya
-- no están, no pasa nada) y limpia las rutas. Se arregla solo.
--
-- Se mide desde `coalesce(fin_el, inicio_el)`: cuando el turno está cerrado manda
-- la SALIDA, que es la más nueva de las dos fotos, para no borrar la de entrada
-- antes de que la otra cumpla el mes. Un turno que quedó ABIERTO se mide por su
-- entrada y sus fotos también se borran al mes: la política es la política, y un
-- turno sin cerrar hace 30 días es un problema que el reporte lleva gritando
-- desde el primer día.
-- ============================================================================

/** Quién puede: la tarea automática (service_role, sin `auth.uid()`) o el SA. */
create or replace function private.turno_fotos_exige_tarea()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and private.user_role() is distinct from 'superadmin' then
    raise exception 'Solo la tarea de limpieza o el superadministrador.';
  end if;
end;
$$;
revoke all on function private.turno_fotos_exige_tarea() from public;

/** Rutas de fotos con más de `p_dias` días. Una fila por foto. */
create or replace function public.turno_fotos_vencidas(p_dias int default 30)
returns table (turno_id bigint, ruta text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.turno_fotos_exige_tarea();
  if p_dias < 1 then
    raise exception 'El plazo tiene que ser de al menos un día.';
  end if;
  return query
    select t.id, f.ruta
      from public.turno t
      cross join lateral (values (t.foto_inicio_path), (t.foto_fin_path)) as f(ruta)
     where f.ruta is not null
       and coalesce(t.fin_el, t.inicio_el) < now() - make_interval(days => p_dias)
     order by t.id;
end;
$$;
revoke all on function public.turno_fotos_vencidas(int) from public;
grant execute on function public.turno_fotos_vencidas(int) to authenticated, service_role;

/** Limpia las rutas ya borradas del almacenamiento. Devuelve cuántas fotos olvidó. */
create or replace function public.turno_fotos_olvidar(p_rutas text[])
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n int := 0;
  v_i int;
begin
  perform private.turno_fotos_exige_tarea();
  if p_rutas is null or array_length(p_rutas, 1) is null then
    return 0;
  end if;

  update public.turno set foto_inicio_path = null where foto_inicio_path = any (p_rutas);
  get diagnostics v_i = row_count;
  v_n := v_n + v_i;

  update public.turno set foto_fin_path = null where foto_fin_path = any (p_rutas);
  get diagnostics v_i = row_count;
  v_n := v_n + v_i;

  return v_n;
end;
$$;
revoke all on function public.turno_fotos_olvidar(text[]) from public;
grant execute on function public.turno_fotos_olvidar(text[]) to authenticated, service_role;
