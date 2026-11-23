-- Cafetería · el pedido ya no lleva zona de lista ni forma de pago (Laura, 20-nov-2026).
--
--   · "¿Dónde estás?" pasó de una lista de zonas (una por QR) a un campo que la
--     persona ESCRIBE. Ya no hay un QR por zona: es uno solo para todo el club.
--   · Se quitó "Cómo pagas al recibir": la cafetería lleva el QR o el datáfono
--     al entregar.
--
-- La tabla está VACÍA (0 pedidos, contado justo antes) y el código publicado no
-- la usa todavía, así que no se pierde nada ni se rompe nada en producción.

alter table public.cafeteria_pedidos rename column zona_nombre to ubicacion;
alter table public.cafeteria_pedidos drop column zona_id;
alter table public.cafeteria_pedidos drop column pago;

comment on column public.cafeteria_pedidos.ubicacion is
  'Dónde está la persona, como lo escribió ("cancha de tenis 1", "zona social").';
comment on column public.cafeteria_pedidos.detalle_ubicacion is
  'Opcional: cómo encontrarla ("banca azul", "camiseta roja").';
