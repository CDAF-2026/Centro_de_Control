-- "Este día no se dictó clase", con su motivo (22-sep-2026, pedido de Laura)
--
-- El estado `cancelada` ya existía y ya sacaba la clase de la cola, pero no
-- guardaba POR QUÉ. Con el cierre derivado del planeador eso importa más: lo que
-- no se cierre queda pendiente para siempre, y hace falta una salida para lo que
-- el calendario no previó (un receso sin cargar, un profesor enfermo, lluvia,
-- la cancha inundada). Sin motivo, "cancelada" y "cancelada" se ven iguales y
-- significan cosas distintas — el fallo que este archivo persigue en todas partes.

begin;

alter table public.clases add column if not exists motivo_cancelacion text;

comment on column public.clases.motivo_cancelacion is
  'Por qué no se dictó. Obligatorio al cerrar como `cancelada`; se limpia al reabrir. Complementa a `academia_receso`: el receso evita marcar 100 clases a mano, esto cubre lo que el calendario no previó.';

commit;
