-- ============================================================================
-- 0027 · Cliente — "a nombre de quién se factura" (identidad de facturación)
-- ----------------------------------------------------------------------------
-- Un cliente puede recibir sus facturas de Siigo bajo un NIT distinto a su
-- cédula (p. ej. una empresa o un familiar que paga por él). Guardamos el
-- nombre (para leerlo en la hoja de vida) y el NIT (para atribuir las facturas).
-- El match real de facturas es por NIT: documento manda; si no, factura_a_nit.
-- ============================================================================

alter table public.clientes
  add column if not exists factura_a_nombre text,
  add column if not exists factura_a_nit text;

comment on column public.clientes.factura_a_nit is
  'NIT/cédula bajo el cual se factura a este cliente en Siigo, además de su documento. Se usa para atribuirle sus facturas.';

-- Identidades de facturación existentes en Siigo (para el autocompletar del campo).
create or replace function public.siigo_clientes_facturacion()
returns table (nit text, nombre text)
language sql stable as $$
  select cliente_identificacion, max(cliente_nombre_siigo)
  from public.siigo_facturas
  where cliente_nombre_siigo is not null and trim(cliente_nombre_siigo) <> ''
    and cliente_identificacion is not null
  group by cliente_identificacion
  order by 2;
$$;

grant execute on function public.siigo_clientes_facturacion() to authenticated;
