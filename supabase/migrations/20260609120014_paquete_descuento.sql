-- 0014 · Descuento en el catálogo de paquetes. El precio final = precio * (1 - descuento/100).
alter table public.paquetes_catalogo
  add column if not exists descuento_pct numeric not null default 0
    check (descuento_pct >= 0 and descuento_pct <= 100);

comment on column public.paquetes_catalogo.descuento_pct is
  'Porcentaje de descuento sobre el precio del paquete (0–100). El precio final se calcula.';
