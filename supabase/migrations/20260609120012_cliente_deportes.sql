-- 0012 · Deportes del cliente (tenis/pádel). Dato manual (no viene de EasyCancha).
alter table public.clientes
  add column if not exists deportes public.deporte[] not null default '{}';

comment on column public.clientes.deportes is
  'Deportes de los que el cliente es alumno (tenis/padel). Se llena a mano.';
