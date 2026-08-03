-- ============================================================================
-- 0041 · Un paquete asignado por error se ANULA, no se borra
-- ----------------------------------------------------------------------------
-- Hasta ahora un paquete asignado a un cliente quedaba fijo: no se podía
-- corregir la vigencia ni deshacer una asignación equivocada. Se agrega el
-- estado `anulado` (solo el superadministrador) y el rastro de quién y cuándo.
--
-- Por qué un estado nuevo y no una columna booleana: todo el código que ofrece
-- paquetes con saldo filtra por `estado = 'activo'` (clases/actions.ts,
-- clases/nueva/page.tsx). Al ser una lista blanca, un estado nuevo queda fuera
-- solo, sin tocar esas consultas. Con un booleano habría que acordarse de
-- filtrarlo en cada sitio, y el olvido sería silencioso.
-- ============================================================================

alter type public.paquete_estado add value if not exists 'anulado';

alter table public.paquetes_cliente
  add column if not exists anulado_el  timestamptz,
  add column if not exists anulado_por uuid references public.profiles (id) on delete set null;

comment on column public.paquetes_cliente.anulado_el is
  'Cuándo se anuló el paquete. La fila NO se borra: puede tener clases enganchadas.';
