-- ============================================================================
-- 0023 · Siigo — nombre del cliente en la factura (para identificar al conciliar)
-- ============================================================================
alter table public.siigo_facturas add column cliente_nombre_siigo text;
