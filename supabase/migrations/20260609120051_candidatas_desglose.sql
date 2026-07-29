-- ============================================================================
-- 0051 · Candidatas del evento: desglose visible + ventana ampliable
-- ----------------------------------------------------------------------------
-- DECISIÓN DE NEGOCIO (Laura, jul-2026) — el evento se mide por CONTRIBUCIÓN,
-- no por inscripción pura: si no hubiera torneo, esa persona no habría estado en
-- el club y no habría consumido. Así que cuando una factura mezcla inscripción con
-- cafetería/almacén, el evento se lleva la factura COMPLETA, no solo su línea.
-- Por eso `evento_id` sigue viviendo en la factura y no se partió por línea.
--
-- Consecuencias que hay que tener presentes al leer las cifras:
--   · La tajada de Cafetería/Almacén del dashboard se achica: esa plata pasa a
--     contarse dentro de la utilidad del evento. El total del club NO cambia.
--   · El margen del torneo sale optimista: entra la venta de cafetería a precio
--     lleno pero su costo de mercancía no está en `evento_gastos`. Si se quiere
--     el margen fino, ese costo se registra como gasto del evento.
--
-- Lo que agrega esta migración:
--   1. `monto_evento` — cuánto de la factura es del servicio del evento. NO se usa
--      para partir la plata (se ata completa): es para que al marcar se vea qué
--      parte es inscripción y qué parte es consumo.
--   2. `p_solo_servicio` — en false trae TODAS las facturas de la ventana, tengan
--      o no línea del servicio. Sirve justo para el caso del argumento: el
--      acompañante que solo consumió cafetería durante el torneo y cuya factura
--      no tiene ninguna línea de "Torneos".
-- ⚠️ DROP + CREATE (no `create or replace`): agregar un parámetro con default
-- dejando la firma vieja viva vuelve ambigua la llamada.
-- ============================================================================

drop function if exists public.evento_facturas_candidatas(bigint);

create function public.evento_facturas_candidatas(
  p_evento         bigint,
  p_solo_servicio  boolean default true
)
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
  /** Parte de la factura que es del servicio del evento (informativo, no parte la plata). */
  monto_evento           integer,
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
           fecha_inicio - 15                      as desde,
           coalesce(fecha_fin, fecha_inicio) + 15 as hasta
    from public.eventos
    where id = p_evento
  ),
  cand as (
    select f.id, f.numero, f.fecha, f.cliente_nombre_siigo, f.cliente_identificacion,
           f.cliente_id, f.total, f.saldo, f.estado_conciliacion,
           coalesce((
             select sum(l.monto)
             from public.siigo_factura_lineas l
             where l.factura_id = f.id and l.servicio_id = ev.servicio_id
           ), 0)::integer as monto_evento
    from public.siigo_facturas f
    cross join ev
    where f.evento_id is null
      and f.fecha between ev.desde and ev.hasta
      -- Con p_solo_servicio la factura debe tocar el servicio del evento; sin él,
      -- entra todo lo facturado en esas fechas (consumo de asistentes incluido).
      and (
        not p_solo_servicio
        or (ev.servicio_id is not null and exists (
              select 1 from public.siigo_factura_lineas l
              where l.factura_id = f.id and l.servicio_id = ev.servicio_id
           ))
      )
  )
  select c.id, c.numero, c.fecha, c.cliente_nombre_siigo, c.cliente_identificacion,
         c.cliente_id, c.total, c.saldo, c.estado_conciliacion,
         (select string_agg(distinct l2.descripcion, ' · ')
            from public.siigo_factura_lineas l2
           where l2.factura_id = c.id and l2.descripcion is not null),
         c.monto_evento,
         count(*) over ()::bigint,
         coalesce(sum(c.total) over (), 0)::bigint
  from cand c
  -- Primero las que más inscripción traen: son las que seguro son del evento.
  order by c.monto_evento desc, c.fecha, c.numero
  limit 200;
$$;

grant execute on function public.evento_facturas_candidatas(bigint, boolean) to authenticated;

comment on function public.evento_facturas_candidatas(bigint, boolean) is
  'Facturas atables a un evento (±15 días). p_solo_servicio=true: solo las que tocan el servicio del evento; false: todo lo facturado en la ventana (consumo de asistentes). `monto_evento` es informativo: la factura se ata completa (el evento se mide por contribución).';
