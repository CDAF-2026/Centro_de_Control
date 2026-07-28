-- ============================================================================
-- 0049 · `eventos_resultado_periodo` también devuelve la fecha de imputación
-- ----------------------------------------------------------------------------
-- El dashboard no solo suma la utilidad al total del periodo: también la coloca en
-- las curvas (la serie diaria del marcador y el acumulado del comparativo). Sin la
-- fecha había que meterla en un día arbitrario y la forma de la curva quedaba mal.
--
-- Cambia el tipo de retorno, así que toca DROP + CREATE (`create or replace` no
-- puede alterar las columnas de salida de una función que devuelve table).
-- ============================================================================

drop function if exists public.eventos_resultado_periodo(date, date);

create or replace function public.eventos_resultado_periodo(p_desde date, p_hasta date)
returns table (
  evento_id   bigint,
  nombre      text,
  servicio_id bigint,
  fecha       date,      -- coalesce(fecha_fin, fecha_inicio): el resultado cae en el mes del evento
  utilidad    bigint
)
language sql stable as $$
  select e.id,
         e.nombre,
         e.servicio_id,
         coalesce(e.fecha_fin, e.fecha_inicio),
         coalesce(e.cierre_utilidad, 0)::bigint
  from public.eventos e
  where e.cerrado_el is not null
    and e.estado <> 'cancelado'
    and coalesce(e.fecha_fin, e.fecha_inicio) between p_desde and p_hasta;
$$;

grant execute on function public.eventos_resultado_periodo(date, date) to authenticated;

comment on function public.eventos_resultado_periodo(date, date) is
  'Utilidad congelada de los eventos CERRADOS imputados al periodo, con su fecha. Es lo que el dashboard suma en vez del bruto.';
