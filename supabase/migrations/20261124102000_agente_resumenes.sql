-- ═══════════════════════════════════════════════════════════════════════════
-- Agente IA · Fase 1, paso 1 (24-nov-2026): los resúmenes que faltaban.
-- Plan: docs/plan-agente-ia-fase1.md
--
-- Toda suma va en SQL (handoff §1.8: PostgREST corta en 1.000 filas sin avisar).
-- Las cifras de dinero siguen la MISMA fórmula que los RPC del dashboard:
--   facturado de una factura = greatest(total - nota_credito, 0), y se reparte entre
--   sus líneas en proporción a `monto` (como siigo_facturado_servicio).
--
-- SECURITY INVOKER: corren con la sesión de quien llama y la RLS decide qué ve,
-- igual que los RPC de Siigo que ya existen. El agente llama con la sesión del
-- superadministrador, que ve todo.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Clases por profesor, deporte, tipo y estado ───────────────────────────
-- El valor sigue a la liquidación (src/lib/liquidacion.ts): particular =
-- coalesce(valor_facturado, precio); paquete = coalesce(valor_facturado,
-- precio del paquete ÷ clases); academia = 0, porque no tiene valor por clase
-- (su dinero sale de Siigo).
create function public.agente_clases_resumen(p_desde date, p_hasta date)
returns table (
  profesor_id uuid, profesor text, deporte text, tipo text, estado text,
  clases bigint, horas numeric, valor bigint
)
language sql
stable
set search_path = ''
as $$
  select c.profesor_id,
         coalesce(p.nombre, 'Sin profesor') as profesor,
         coalesce(c.deporte::text, 'sin deporte') as deporte,
         case when c.tipo = 'academia' then 'academia'
              when c.paquete_cliente_id is not null then 'paquete'
              else 'particular' end as tipo,
         c.estado::text as estado,
         count(*) as clases,
         round(sum(coalesce(extract(epoch from (c.hora_fin - c.hora_inicio)) / 3600.0,
                            cs.duracion_min / 60.0, 0))::numeric, 1) as horas,
         sum(case
               when c.tipo = 'academia' then 0
               when c.paquete_cliente_id is not null
                 then coalesce(c.valor_facturado, round(pc.precio::numeric / nullif(pc.num_clases, 0)), 0)
               else coalesce(c.valor_facturado, c.precio, 0)
             end)::bigint as valor
  from public.clases c
  left join public.profiles p on p.id = c.profesor_id
  left join public.paquetes_cliente pc on pc.id = c.paquete_cliente_id
  left join public.clase_semanal cs on cs.id = c.clase_semanal_id
  where c.fecha between p_desde and p_hasta
  group by 1, 2, 3, 4, 5
  order by 2, 3, 4, 5;
$$;

-- ─── Asistencia de academias ───────────────────────────────────────────────
-- Solo clases de academia CERRADAS (realizada). academia NULL = la clase mezcla
-- niños de recreativa y competencia, o es de colegio.
create function public.agente_asistencia_resumen(p_desde date, p_hasta date)
returns table (
  academia text, deporte text, profesor text, clases bigint,
  presentes bigint, ausentes bigint, excusas_medicas bigint, reposiciones bigint, ninos bigint
)
language sql
stable
set search_path = ''
as $$
  select coalesce(a.nombre, 'Mixta o de colegio') as academia,
         coalesce(c.deporte::text, 'sin deporte') as deporte,
         coalesce(p.nombre, 'Sin profesor') as profesor,
         count(distinct c.id) as clases,
         count(s.id) filter (where s.estado = 'presente') as presentes,
         count(s.id) filter (where s.estado = 'ausente') as ausentes,
         count(s.id) filter (where s.estado = 'excusa_medica') as excusas_medicas,
         count(s.id) filter (where s.estado = 'reposicion') as reposiciones,
         count(distinct s.miembro_id) filter (where s.estado in ('presente', 'reposicion')) as ninos
  from public.clases c
  left join public.academias a on a.id = c.academia_id
  left join public.profiles p on p.id = c.profesor_id
  left join public.asistencias s on s.clase_id = c.id
  where c.tipo = 'academia'
    and c.estado = 'realizada'
    and c.fecha between p_desde and p_hasta
  group by 1, 2, 3
  order by 1, 3;
$$;

-- ─── Paquetes ──────────────────────────────────────────────────────────────
-- p_desde / p_hasta opcionales: si vienen, solo los paquetes que INICIAN en ese
-- rango (vendidos en el periodo). "Por vencer" = activos que vencen en 15 días.
create function public.agente_paquetes_resumen(p_desde date default null, p_hasta date default null)
returns table (
  deporte text, paquete text, estado text, paquetes bigint, clientes bigint,
  clases_vendidas bigint, clases_consumidas bigint, valor_vendido bigint, por_vencer_15_dias bigint
)
language sql
stable
set search_path = ''
as $$
  with hoy as (select (now() at time zone 'America/Bogota')::date as d)
  select coalesce(cat.deporte::text, 'sin deporte') as deporte,
         coalesce(cat.nombre, 'Sin catálogo') as paquete,
         pc.estado::text as estado,
         count(*) as paquetes,
         count(distinct pc.cliente_id) as clientes,
         sum(pc.num_clases)::bigint as clases_vendidas,
         sum(pc.clases_consumidas)::bigint as clases_consumidas,
         sum(pc.precio)::bigint as valor_vendido,
         count(*) filter (where pc.estado = 'activo' and pc.vence_el between hoy.d and hoy.d + 15) as por_vencer_15_dias
  from public.paquetes_cliente pc
  cross join hoy
  left join public.paquetes_catalogo cat on cat.id = pc.catalogo_id
  where (p_desde is null or coalesce(pc.inicia_el, (pc.created_at at time zone 'America/Bogota')::date) >= p_desde)
    and (p_hasta is null or coalesce(pc.inicia_el, (pc.created_at at time zone 'America/Bogota')::date) <= p_hasta)
  group by 1, 2, 3
  order by 1, 2, 3;
$$;

-- ─── Clientes ──────────────────────────────────────────────────────────────
-- Indicadores sueltos, cada uno con su descripción para que el agente no los
-- malinterprete. "Compraron antes y no ahora" compara con el periodo anterior de
-- la misma duración (sirve para "¿por qué bajaron los ingresos?").
create function public.agente_clientes_resumen(p_desde date, p_hasta date)
returns table (indicador text, descripcion text, valor bigint)
language sql
stable
set search_path = ''
as $$
  with hoy as (select (now() at time zone 'America/Bogota')::date as d),
  compras as (
    select distinct f.cliente_id, f.fecha
    from public.siigo_facturas f
    where f.cliente_id is not null and greatest(f.total - f.nota_credito, 0) > 0
  ),
  en_periodo as (select distinct cliente_id from compras where fecha between p_desde and p_hasta),
  en_anterior as (
    select distinct cliente_id from compras
    where fecha between p_desde - (p_hasta - p_desde + 1) and p_desde - 1
  ),
  primera as (select cliente_id, min(fecha) as primera from compras group by cliente_id),
  personas as (
    select m.* from public.cliente_miembros m
    join public.clientes c on c.id = m.cliente_id
    where m.activo and c.estado = 'activo'
  )
  select 'fichas_activas', 'Fichas (cuentas familiares) activas',
         (select count(*) from public.clientes where estado = 'activo')
  union all
  select 'fichas_retiradas', 'Fichas retiradas',
         (select count(*) from public.clientes where estado = 'retirado')
  union all
  select 'personas_activas', 'Personas activas dentro de fichas activas', (select count(*) from personas)
  union all
  select 'personas_tenis', 'Personas activas que practican tenis',
         (select count(*) from personas where 'tenis' = any(deportes))
  union all
  select 'personas_padel', 'Personas activas que practican pádel',
         (select count(*) from personas where 'padel' = any(deportes))
  union all
  select 'menores_de_edad', 'Personas activas menores de 18 años',
         (select count(*) from personas, hoy where fecha_nacimiento > hoy.d - interval '18 years')
  union all
  select 'adultos', 'Personas activas de 18 años o más',
         (select count(*) from personas, hoy where fecha_nacimiento <= hoy.d - interval '18 years')
  union all
  select 'sin_fecha_de_nacimiento', 'Personas activas sin fecha de nacimiento registrada',
         (select count(*) from personas where fecha_nacimiento is null)
  union all
  select 'fichas_nuevas_en_la_plataforma', 'Fichas que entraron a la plataforma en el periodo (no es cuándo empezaron en el club)',
         (select count(*) from public.clientes
          where (created_at at time zone 'America/Bogota')::date between p_desde and p_hasta)
  union all
  select 'fichas_con_compras', 'Fichas con al menos una factura de Siigo en el periodo',
         (select count(*) from en_periodo)
  union all
  select 'fichas_con_primera_compra', 'Fichas cuya PRIMERA factura de Siigo cae en el periodo (la historia empieza el 2026-06-01)',
         (select count(*) from primera where primera between p_desde and p_hasta)
  union all
  select 'fichas_compraron_antes_y_no_ahora', 'Fichas con facturas en el periodo anterior de igual duración y ninguna en este',
         (select count(*) from en_anterior where cliente_id not in (select cliente_id from en_periodo))
  union all
  select 'personas_en_academia', 'Personas con matrícula activa en alguna academia',
         (select count(distinct miembro_id) from public.inscripciones where activa)
  union all
  select 'fichas_con_paquete_activo', 'Fichas con al menos un paquete de clases activo',
         (select count(distinct cliente_id) from public.paquetes_cliente where estado = 'activo');
$$;

-- ─── Pedidos de la cafetería (la carta por QR) ─────────────────────────────
-- Un pedido registrado NO prueba que se entregó ni que se pagó; la venta real
-- de la cafetería está en Siigo. Los cancelados solo cuentan en la dimensión
-- "estado".
create function public.agente_cafeteria_pedidos(p_desde date, p_hasta date)
returns table (dimension text, clave text, pedidos bigint, unidades bigint, monto bigint)
language sql
stable
set search_path = ''
as $$
  with p as (
    select id, (recibido_el at time zone 'America/Bogota') as local, lineas, total, pago, estado
    from public.cafeteria_pedidos
    where (recibido_el at time zone 'America/Bogota')::date between p_desde and p_hasta
  ),
  vivos as (select * from p where estado <> 'cancelado')
  select 'estado', estado, count(*), null::bigint, sum(total)::bigint from p group by 2
  union all
  select 'dia', local::date::text, count(*), null, sum(total)::bigint from vivos group by 2
  union all
  select 'dia_semana', (array['lunes','martes','miércoles','jueves','viernes','sábado','domingo'])[extract(isodow from local)::int],
         count(*), null, sum(total)::bigint from vivos group by 2
  union all
  select 'hora', to_char(local, 'HH24') || ':00', count(*), null, sum(total)::bigint from vivos group by 2
  union all
  select 'pago', coalesce(pago, 'sin dato'), count(*), null, sum(total)::bigint from vivos group by 2
  union all
  select 'producto', l ->> 'nombre', count(distinct v.id),
         sum((l ->> 'cantidad')::int)::bigint, sum((l ->> 'subtotal')::int)::bigint
  from vivos v cross join lateral jsonb_array_elements(v.lineas) l
  group by 2
  order by 1, 2;
$$;

-- ─── Ventas por producto (Siigo) ───────────────────────────────────────────
-- Para "¿qué dejar de vender por poca rotación?". Con p_servicio (p. ej. Cafetería)
-- incluye también los productos del catálogo de Siigo de esa categoría que NO se
-- vendieron en el periodo (unidades 0), que son justo los de menos rotación.
-- No hay costo ni inventario: mide rotación, no margen.
create function public.agente_productos_vendidos(p_desde date, p_hasta date, p_servicio bigint default null)
returns table (
  codigo text, producto text, servicio_id bigint, servicio text, unidades numeric,
  facturado bigint, facturas bigint, ultima_venta_periodo date, ultima_venta_historica date,
  dias_sin_venta integer
)
language sql
stable
set search_path = ''
as $$
  with hoy as (select (now() at time zone 'America/Bogota')::date as d),
  f as (
    select id, fecha, greatest(total - nota_credito, 0) as neto
    from public.siigo_facturas
    where fecha between p_desde and p_hasta
  ),
  l as (
    select li.factura_id, li.codigo, li.descripcion, li.servicio_id, li.monto, li.cantidad,
           sum(li.monto) over (partition by li.factura_id) as total_lineas
    from public.siigo_factura_lineas li
    where li.factura_id in (select id from f)
  ),
  ventas as (
    select l.codigo, max(l.descripcion) as descripcion, l.servicio_id,
           sum(l.cantidad) as unidades,
           sum(round(f.neto * (l.monto::numeric / nullif(l.total_lineas, 0))))::bigint as facturado,
           count(distinct l.factura_id) as facturas,
           max(f.fecha) as ultima_venta
    from l join f on f.id = l.factura_id
    group by l.codigo, l.servicio_id
  ),
  sin_venta as (
    select sp.codigo, sp.servicio_id
    from public.siigo_productos sp
    where p_servicio is not null and sp.servicio_id = p_servicio
      and not exists (select 1 from ventas v where v.codigo = sp.codigo)
  ),
  historia as (
    select li.codigo, max(fa.fecha) as ultima
    from public.siigo_factura_lineas li
    join public.siigo_facturas fa on fa.id = li.factura_id
    group by li.codigo
  ),
  todo as (
    select v.codigo, v.descripcion, v.servicio_id, v.unidades, v.facturado, v.facturas, v.ultima_venta
    from ventas v
    where p_servicio is null or v.servicio_id = p_servicio
    union all
    select s.codigo, null, s.servicio_id, 0, 0, 0, null from sin_venta s
  )
  select t.codigo,
         coalesce(sp.nombre, t.descripcion, t.codigo) as producto,
         t.servicio_id,
         coalesce(se.nombre, 'Sin categoría') as servicio,
         t.unidades,
         t.facturado,
         t.facturas,
         t.ultima_venta as ultima_venta_periodo,
         h.ultima as ultima_venta_historica,
         (hoy.d - h.ultima) as dias_sin_venta
  from todo t
  cross join hoy
  left join public.siigo_productos sp on sp.codigo = t.codigo
  left join public.servicios se on se.id = t.servicio_id
  left join historia h on h.codigo = t.codigo
  order by t.facturado desc, t.unidades desc;
$$;

-- ─── Ticket ────────────────────────────────────────────────────────────────
-- Una fila por mes y segmento, más los totales (mes = 'todo el periodo',
-- segmento = 'todas'). Comprador = la ficha o, si no hay ficha, el NIT; la venta
-- a consumidor final (NIT de un dígito repetido) es "mostrador": ahí hay ticket
-- por factura pero no por cliente. Con p_servicio, solo las facturas que traen al
-- menos una línea de esa categoría (el ticket sigue siendo la factura completa).
create function public.agente_ticket(p_desde date, p_hasta date, p_servicio bigint default null)
returns table (
  mes text, segmento text, facturas bigint, compradores bigint, facturado bigint,
  ticket_promedio bigint, ticket_mediana bigint, facturas_por_comprador numeric,
  gasto_por_comprador bigint
)
language sql
stable
set search_path = ''
as $$
  with f as (
    select fa.fecha,
           greatest(fa.total - fa.nota_credito, 0) as neto,
           case
             when fa.cliente_id is not null then 'ficha:' || fa.cliente_id
             when fa.cliente_identificacion is not null and fa.cliente_identificacion !~ '^(.)\1+$'
               then 'nit:' || fa.cliente_identificacion
           end as comprador
    from public.siigo_facturas fa
    where fa.fecha between p_desde and p_hasta
      and greatest(fa.total - fa.nota_credito, 0) > 0
      and (p_servicio is null or exists (
            select 1 from public.siigo_factura_lineas li
            where li.factura_id = fa.id and li.servicio_id = p_servicio))
  ),
  s as (
    select to_char(fecha, 'YYYY-MM') as mes,
           case when comprador is null then 'mostrador' else 'cliente_identificado' end as segmento,
           neto, comprador
    from f
  )
  select coalesce(mes, 'todo el periodo') as mes,
         coalesce(segmento, 'todas') as segmento,
         count(*) as facturas,
         count(distinct comprador) as compradores,
         sum(neto)::bigint as facturado,
         round(avg(neto))::bigint as ticket_promedio,
         round(percentile_cont(0.5) within group (order by neto))::bigint as ticket_mediana,
         round(count(comprador)::numeric / nullif(count(distinct comprador), 0), 2) as facturas_por_comprador,
         round((sum(neto) filter (where comprador is not null))::numeric / nullif(count(distinct comprador), 0))::bigint
           as gasto_por_comprador
  from s
  group by grouping sets ((mes, segmento), (mes), (segmento), ())
  order by (mes is null), mes, (segmento is null), segmento;
$$;

-- ─── Qué se compra junto ───────────────────────────────────────────────────
-- Parejas que salen en la misma factura, por categoría (p_nivel 'servicio') o
-- por producto ('producto'). facturas_a / facturas_b = en cuántas facturas sale
-- cada uno por su cuenta, para medir qué tan frecuente es la pareja.
create function public.agente_compras_juntas(
  p_desde date, p_hasta date, p_nivel text default 'servicio', p_limite integer default 30
)
returns table (a text, b text, facturas_juntas bigint, facturas_a bigint, facturas_b bigint)
language sql
stable
set search_path = ''
as $$
  with l as (
    select distinct li.factura_id,
           case when p_nivel = 'producto'
                then coalesce(sp.nombre, li.descripcion, li.codigo)
                else coalesce(se.nombre, 'Sin categoría') end as item
    from public.siigo_factura_lineas li
    join public.siigo_facturas fa on fa.id = li.factura_id
    left join public.servicios se on se.id = li.servicio_id
    left join public.siigo_productos sp on sp.codigo = li.codigo
    where fa.fecha between p_desde and p_hasta
  ),
  n as (select item, count(*) as facturas from l group by item)
  select x.item, y.item, count(*) as facturas_juntas, na.facturas, nb.facturas
  from l x
  join l y on y.factura_id = x.factura_id and x.item < y.item
  join n na on na.item = x.item
  join n nb on nb.item = y.item
  group by x.item, y.item, na.facturas, nb.facturas
  order by count(*) desc
  limit least(greatest(coalesce(p_limite, 30), 1), 100);
$$;

-- ─── Permisos ──────────────────────────────────────────────────────────────
revoke all on function public.agente_clases_resumen(date, date) from public, anon;
revoke all on function public.agente_asistencia_resumen(date, date) from public, anon;
revoke all on function public.agente_paquetes_resumen(date, date) from public, anon;
revoke all on function public.agente_clientes_resumen(date, date) from public, anon;
revoke all on function public.agente_cafeteria_pedidos(date, date) from public, anon;
revoke all on function public.agente_productos_vendidos(date, date, bigint) from public, anon;
revoke all on function public.agente_ticket(date, date, bigint) from public, anon;
revoke all on function public.agente_compras_juntas(date, date, text, integer) from public, anon;

grant execute on function public.agente_clases_resumen(date, date) to authenticated, service_role;
grant execute on function public.agente_asistencia_resumen(date, date) to authenticated, service_role;
grant execute on function public.agente_paquetes_resumen(date, date) to authenticated, service_role;
grant execute on function public.agente_clientes_resumen(date, date) to authenticated, service_role;
grant execute on function public.agente_cafeteria_pedidos(date, date) to authenticated, service_role;
grant execute on function public.agente_productos_vendidos(date, date, bigint) to authenticated, service_role;
grant execute on function public.agente_ticket(date, date, bigint) to authenticated, service_role;
grant execute on function public.agente_compras_juntas(date, date, text, integer) to authenticated, service_role;
