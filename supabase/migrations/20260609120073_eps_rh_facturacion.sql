-- ============================================================================
-- 0073 · Campos nuevos de la ficha: EPS, RH, tipo/correo de facturación
-- ----------------------------------------------------------------------------
-- La base de datos de niños que entrega el club trae por persona su EPS y su RH
-- (grupo sanguíneo), y a nivel familia el tipo de facturación (persona natural /
-- jurídica) y un correo de facturación. Se agregan para adultos (clientes) y para
-- los miembros de la ficha (cliente_miembros = cada niño/hermano).
--
--  - EPS: texto libre (viene sucio: "SURA", "SURA PREPAGADA", "Colmedica"… se
--    guarda tal cual y se normaliza a ojo; una lista cerrada dejaría fuera casos).
--  - RH: lista cerrada (los 8 grupos ABO×Rh); evita el típico "0-" (cero) por "O-".
--  - Facturación: tipo natural|juridica + correo, junto a factura_a_nombre/nit.
--
-- Además se amplía el tipo de documento con PPT (permiso por protección temporal,
-- migrantes) y RC (registro civil, menores de 7 años). En Colombia: RC < 7 años,
-- TI de 7 a 17, CC desde 18.
-- ============================================================================

-- --- EPS y RH en las dos tablas ---
alter table public.clientes
  add column if not exists eps text,
  add column if not exists rh text;

alter table public.cliente_miembros
  add column if not exists eps text,
  add column if not exists rh text;

-- RH: solo los 8 grupos sanguíneos válidos (o vacío).
alter table public.clientes drop constraint if exists clientes_rh_check;
alter table public.clientes add constraint clientes_rh_check
  check (rh is null or rh in ('O+','O-','A+','A-','B+','B-','AB+','AB-'));

alter table public.cliente_miembros drop constraint if exists cliente_miembros_rh_check;
alter table public.cliente_miembros add constraint cliente_miembros_rh_check
  check (rh is null or rh in ('O+','O-','A+','A-','B+','B-','AB+','AB-'));

comment on column public.clientes.eps is 'EPS del cliente. Texto libre (los datos vienen sin estandarizar).';
comment on column public.clientes.rh is 'Grupo sanguíneo (ABO×Rh), lista cerrada.';
comment on column public.cliente_miembros.eps is 'EPS del miembro (niño/hermano). Texto libre.';
comment on column public.cliente_miembros.rh is 'Grupo sanguíneo del miembro, lista cerrada.';

-- --- Facturación: tipo persona + correo (solo a nivel ficha/cliente) ---
alter table public.clientes
  add column if not exists factura_tipo text,
  add column if not exists factura_email text;

alter table public.clientes drop constraint if exists clientes_factura_tipo_check;
alter table public.clientes add constraint clientes_factura_tipo_check
  check (factura_tipo is null or factura_tipo in ('natural','juridica'));

comment on column public.clientes.factura_tipo is 'Tipo de quien factura: natural | juridica.';
comment on column public.clientes.factura_email is 'Correo al que se envía la factura (puede diferir del correo del cliente).';

-- --- Ampliar tipo_documento con PPT y RC ---
alter table public.clientes drop constraint if exists clientes_tipo_documento_check;
alter table public.clientes add constraint clientes_tipo_documento_check
  check (tipo_documento is null or tipo_documento in ('CC','TI','CE','PP','NIT','PPT','RC'));

alter table public.cliente_miembros drop constraint if exists cliente_miembros_tipo_documento_check;
alter table public.cliente_miembros add constraint cliente_miembros_tipo_documento_check
  check (tipo_documento is null or tipo_documento in ('CC','TI','CE','PP','NIT','PPT','RC'));
