-- 0011 · EasyCancha: enlazar una clase con la reserva original de EasyCancha.
-- Permite "materializar" una reserva como clase (para cierre/liquidación) y evitar
-- duplicados en el calendario y re-asignaciones.

alter table public.clases
  add column if not exists easycancha_booking_id text;

create unique index if not exists clases_ec_booking_uidx
  on public.clases (easycancha_booking_id)
  where easycancha_booking_id is not null;

comment on column public.clases.easycancha_booking_id is
  'ID de la reserva de EasyCancha que originó esta clase (null si es interna).';
