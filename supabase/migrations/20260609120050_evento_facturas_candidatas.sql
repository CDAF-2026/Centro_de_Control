-- ============================================================================
-- 0050 · Facturas candidatas de un evento — cerrar el hueco de la conciliación
-- ----------------------------------------------------------------------------
-- PROBLEMA que arregla:
-- El único sitio donde se le podía poner `evento_id` a una factura era la cola de
-- `/pagos`, que solo lista las `pendiente`. Pero una factura de torneo casi nunca
-- llega ahí:
--   · si el NIT empareja con un cliente conocido → el sync la marca `auto` y sale de la cola
--   · si el pago es anónimo (sin NIT real)       → la marca `mostrador` y tampoco aparece
-- Medido sobre las 42 facturas con línea de torneo de jun–jul 2026: 38 mostrador +
-- 3 auto + 1 pendiente. O sea, el 98% del dinero de torneos NUNCA pasaba por un sitio
-- donde alguien pudiera decir de qué evento era. Resultado: el P&G del evento salía sin
-- ingresos (solo costos = pérdida) y el dashboard seguía contando el bruto del torneo.
--
-- La causa de fondo es que son DOS preguntas distintas y quedaron pegadas:
--   ¿de quién es esta plata? → `cliente_id`  (conciliación)
--   ¿de cuál torneo es?      → `evento_id`   (evento)
-- Esta función responde la segunda sin tocar la primera: devuelve las facturas del
-- servicio del evento dentro de su ventana de fechas, SIN filtrar por estado_conciliacion.
-- Atarlas al evento no las concilia ni les inventa dueño: una mostrador sigue siendo
-- mostrador (ver `atarFacturas` en eventos/actions.ts).
-- ============================================================================

-- Ventana de captura: las inscripciones se facturan desde antes del torneo y las
-- cuentas de última hora, días después. Mismo margen que la sugerencia de /pagos.
create or replace function public.evento_facturas_candidatas(p_evento bigint)
returns table (
  id                     bigint,
  numero                 text,
  fecha                  date,
  cliente_nombre_siigo   text,
  cliente_identificacion text,
  cliente_id             bigint,
  total                  integer,
  saldo                  integer,
  estado_conciliacion    text,
  detalle                text,
  -- Totales de TODO el conjunto candidato (no solo de las filas devueltas): las
  -- ventanas se calculan antes del LIMIT, así el aviso del cierre es exacto aunque
  -- la lista venga recortada.
  n_candidatas           bigint,
  monto_candidatas       bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with ev as (
    select servicio_id,
           fecha_inicio - 15                          as desde,
           coalesce(fecha_fin, fecha_inicio) + 15     as hasta
    from public.eventos
    where id = p_evento
      and servicio_id is not null   -- sin servicio no hay con qué emparejar
  )
  select f.id,
         f.numero,
         f.fecha,
         f.cliente_nombre_siigo,
         f.cliente_identificacion,
         f.cliente_id,
         f.total,
         f.saldo,
         f.estado_conciliacion,
         (select string_agg(distinct l2.descripcion, ' · ')
            from public.siigo_factura_lineas l2
           where l2.factura_id = f.id and l2.descripcion is not null),
         count(*) over ()::bigint,
         coalesce(sum(f.total) over (), 0)::bigint
  from public.siigo_facturas f
  cross join ev
  where f.evento_id is null                            -- las ya atadas no son candidatas
    and f.fecha between ev.desde and ev.hasta
    and exists (
      select 1
      from public.siigo_factura_lineas l
      where l.factura_id = f.id
        and l.servicio_id = ev.servicio_id
    )
  order by f.fecha, f.numero
  limit 200;                                           -- tope de PostgREST, muy por encima de un torneo real
$$;

grant execute on function public.evento_facturas_candidatas(bigint) to authenticated;

comment on function public.evento_facturas_candidatas(bigint) is
  'Facturas que podrían ser de un evento (mismo servicio, ±15 días), sin filtrar por estado_conciliacion. Para atarlas desde la ficha del evento: mostrador y auto nunca pasan por la cola de /pagos.';
