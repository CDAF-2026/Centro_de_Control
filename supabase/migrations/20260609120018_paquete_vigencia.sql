-- ============================================================================
-- 0018 · Paquetes — fecha de inicio de la asignación (vence_el ya existe)
-- ============================================================================

-- Vigencia del paquete asignado: inicia_el … vence_el (ambas se eligen al asignar).
alter table public.paquetes_cliente
  add column inicia_el date not null default current_date;
