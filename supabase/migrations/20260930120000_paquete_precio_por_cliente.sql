-- ============================================================================
-- 0069 · El precio del paquete se pone al ASIGNARLO, no en el catálogo
-- ----------------------------------------------------------------------------
-- Pedido del club (30-sep-2026): el mismo paquete (p. ej. pádel, 8 clases,
-- 1 persona) se cobra distinto según el cliente. Con el precio en el catálogo
-- tocaba crear un paquete por cada precio y la lista se llenaba de repetidos.
--
-- Ahora:
--   · `paquetes_cliente.precio` es el valor que ESE cliente paga por ESE paquete.
--     Lo digita quien asigna (obligatorio y > 0, lo exige la app). Solo el
--     superadministrador lo corrige después.
--   · La nómina y el cierre de clase leen este precio (÷ num_clases).
--   · `paquetes_catalogo.precio` y ambos `descuento_pct` quedan OBSOLETOS. No se
--     borran en esta migración a propósito: el código en producción los sigue
--     leyendo hasta que se despliegue la versión nueva, y borrarlos antes rompería
--     /paquetes y la liquidación en ese lapso. Se pueden borrar en una migración
--     posterior, después del despliegue.
--   · Se deja DEFAULT 0 (y no un CHECK > 0) por la misma razón: el código viejo
--     inserta sin precio hasta el despliegue. La regla "nunca cero" la aplica la
--     acción de asignar; la ficha marca en rojo un paquete que quedara en 0.
-- ============================================================================

alter table public.paquetes_cliente
  add column if not exists precio integer not null default 0 check (precio >= 0);

comment on column public.paquetes_cliente.precio is
  'Valor total que este cliente paga por este paquete (COP). Se digita al asignar; la app exige > 0. La nómina paga precio ÷ num_clases por clase.';

-- Relleno de los paquetes ya asignados con el valor que venían heredando del
-- catálogo (precio del catálogo con sus dos descuentos, que hoy son todos 0),
-- para que la nómina ya liquidada no se mueva un peso.
update public.paquetes_cliente p
   set precio = round(
         round(c.precio * (1 - c.descuento_pct / 100.0)) * (1 - p.descuento_pct / 100.0)
       )::integer
  from public.paquetes_catalogo c
 where c.id = p.catalogo_id
   and p.precio = 0;

comment on column public.paquetes_catalogo.precio is
  'OBSOLETO desde 2026-09-30: el precio va en paquetes_cliente.precio. No se lee.';
comment on column public.paquetes_catalogo.descuento_pct is
  'OBSOLETO desde 2026-09-30: sin uso. No se lee.';
comment on column public.paquetes_cliente.descuento_pct is
  'OBSOLETO desde 2026-09-30: el precio final va en `precio`. No se lee.';

-- ── Limpieza del catálogo (acordada con Laura el 30-sep-2026) ────────────────
-- Nombres solo con deporte, número de clases y personas: sin profesor ni precio.
-- Los repetidos se DESACTIVAN (no se borran) para que los clientes que ya los
-- tienen conserven el nombre en su ficha.
update public.paquetes_catalogo set nombre = 'Pádel 5 clases · 2 personas', deporte = 'padel' where id = 15; -- estaba como tenis con nombre de pádel
update public.paquetes_catalogo set nombre = 'Tenis 8 clases · 1 persona'    where id = 14;
update public.paquetes_catalogo set nombre = 'Tenis 12 clases · 1 persona'   where id = 20;
update public.paquetes_catalogo set nombre = 'Tenis 12 clases · 2 personas'  where id = 21;
update public.paquetes_catalogo set nombre = 'Pádel 8 clases · 1 persona'    where id = 8;
update public.paquetes_catalogo set nombre = 'Pádel 8 clases · 2 personas'   where id = 11;
update public.paquetes_catalogo set nombre = 'Pádel 10 clases · 1 persona'   where id = 9;
update public.paquetes_catalogo set nombre = 'Pádel 10 clases · 2 personas'  where id = 12;
update public.paquetes_catalogo set nombre = 'Pádel 12 clases · 1 persona'   where id = 10;
update public.paquetes_catalogo set nombre = 'Pádel 12 clases · 2 personas'  where id = 13;
-- Repetidos de 8 y 11: conservan su nombre original (historial) y salen del selector.
update public.paquetes_catalogo set activo = false where id in (16, 19);
