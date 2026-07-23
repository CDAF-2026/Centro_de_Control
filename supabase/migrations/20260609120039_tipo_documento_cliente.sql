-- ============================================================================
-- 0039 · Tipo de documento del cliente (CC / TI / CE / PP / NIT)
-- ----------------------------------------------------------------------------
-- La API de EasyCancha entrega el documento de cada persona en tres campos:
--   userFoidType ("NI" = número de identificación, "PP" = pasaporte)
--   userFoidCountry ("CO", "FR", "AR"…)
--   userFoidNumber (el número)
-- Guardamos el tipo junto al número para distinguir la cédula colombiana del
-- pasaporte de los extranjeros (hoy 7 de ~780 personas). El match con Siigo
-- sigue siendo por NÚMERO (documento = NIT), el tipo es informativo.
--
-- Se deja NULL en los existentes: "sin especificar" es distinto de "es cédula".
-- ============================================================================

alter table public.clientes
  add column if not exists tipo_documento text;

alter table public.clientes
  drop constraint if exists clientes_tipo_documento_check;

alter table public.clientes
  add constraint clientes_tipo_documento_check
  check (tipo_documento is null or tipo_documento in ('CC', 'TI', 'CE', 'PP', 'NIT'));

comment on column public.clientes.tipo_documento is
  'Tipo del documento en la columna documento: CC cédula, TI tarjeta de identidad, CE cédula de extranjería, PP pasaporte, NIT. NULL = sin especificar. Desde EasyCancha: NI→CC, PP→PP.';

-- Mismo campo para los miembros de la cuenta familiar (hermanos), que también
-- tienen documento propio y suelen ser menores con tarjeta de identidad.
alter table public.cliente_miembros
  add column if not exists tipo_documento text;

alter table public.cliente_miembros
  drop constraint if exists cliente_miembros_tipo_documento_check;

alter table public.cliente_miembros
  add constraint cliente_miembros_tipo_documento_check
  check (tipo_documento is null or tipo_documento in ('CC', 'TI', 'CE', 'PP', 'NIT'));
