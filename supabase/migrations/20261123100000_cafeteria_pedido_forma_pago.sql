-- Cafetería · vuelve la forma de pago al pedido (Laura, 23-nov-2026).
--
--   · "Forma de pago": QR, datáfono o efectivo (se escoge una). Con eso la
--     cafetería sabe qué llevar al entregar.
--   · Si es efectivo, "Devuelta de cuánto": con qué billete paga, para llevar
--     el cambio. Opcional.
--
-- Solo AGREGA columnas que aceptan vacío: los pedidos de antes quedan sin forma
-- de pago y el código publicado (que no las manda) sigue funcionando igual.

alter table public.cafeteria_pedidos
  add column pago text check (pago in ('qr', 'datafono', 'efectivo')),
  add column devuelta_de integer check (devuelta_de > 0);

comment on column public.cafeteria_pedidos.pago is
  'Cómo paga al recibir: qr · datafono · efectivo. Nulo en los pedidos de antes del 23-nov-2026.';
comment on column public.cafeteria_pedidos.devuelta_de is
  'Solo efectivo: con qué billete paga, para llevar el cambio. Nulo si no lo dijo.';
