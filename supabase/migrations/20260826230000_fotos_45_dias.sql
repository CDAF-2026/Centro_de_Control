-- ============================================================================
-- 0087 · Las fotos de turno se guardan 45 días, no 30
-- ----------------------------------------------------------------------------
-- Decisión de Laura, 26-ago-2026. Solo cambia el plazo por defecto; la lógica
-- de qué se borra y en qué orden es la misma de 0086.
--
-- ⚠️ ESTE número es el que MANDA: la tarea `turnos-limpiar-fotos` llama a la
-- función SIN pasarle el plazo justamente para que no exista una segunda copia
-- que se pueda desincronizar. Lo único que hay que mantener a la par es el
-- TEXTO que se le muestra a la gente (`FOTOS_DIAS` en src/lib/turnos.ts), y las
-- dos constantes se apuntan la una a la otra.
-- ============================================================================

create or replace function public.turno_fotos_vencidas(p_dias int default 45)
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
