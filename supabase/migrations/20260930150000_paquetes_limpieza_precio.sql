-- ============================================================================
-- 0071 · Limpieza tras el despliegue del precio por cliente (30-sep-2026)
-- ----------------------------------------------------------------------------
-- La 20260930120000 dejó las columnas viejas y un DEFAULT 0 a propósito, porque
-- el código en producción todavía las leía. Ya está desplegado (commit 26ef1bd):
--   1. El único paquete que alcanzó a nacer en $0 con el código viejo (id 43,
--      anulado, 0 clases) toma el precio del catálogo, como los 15 del relleno
--      original, con rastro en audit_log.
--   2. `paquetes_cliente.precio` pasa a exigir > 0 en la BASE y pierde el
--      default: la regla "nunca cero" deja de depender solo de la pantalla.
--   3. Se borran `paquetes_catalogo.precio`, `paquetes_catalogo.descuento_pct`
--      y `paquetes_cliente.descuento_pct`. Ninguna función SQL ni vista las usa
--      (verificado en pg_proc e information_schema.views) y el código ya no las
--      lee.
-- ============================================================================

-- 1 · Ningún asignado puede quedar en 0 antes del check.
with arreglados as (
  update public.paquetes_cliente p
     set precio = c.precio
    from public.paquetes_catalogo c
   where c.id = p.catalogo_id
     and p.precio <= 0
     and c.precio > 0
  returning p.id, p.precio, p.estado
)
insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
select null, 'paquete.corregir_precio', 'paquetes_cliente', a.id::text,
       jsonb_build_object('precio', 0),
       jsonb_build_object('precio', a.precio, 'estado', a.estado,
                          'motivo', 'nació en $0 con el código anterior al precio por cliente; toma el precio del catálogo')
  from arreglados a;

-- 2 · La regla en la base.
alter table public.paquetes_cliente
  drop constraint if exists paquetes_cliente_precio_check,
  alter column precio drop default,
  add constraint paquetes_cliente_precio_check check (precio > 0);

comment on column public.paquetes_cliente.precio is
  'Valor total que este cliente paga por este paquete (COP). Se digita al asignar; siempre > 0. La nómina paga precio ÷ num_clases por clase.';

-- 3 · Fuera lo obsoleto.
alter table public.paquetes_catalogo
  drop column if exists precio,
  drop column if exists descuento_pct;

alter table public.paquetes_cliente
  drop column if exists descuento_pct;
