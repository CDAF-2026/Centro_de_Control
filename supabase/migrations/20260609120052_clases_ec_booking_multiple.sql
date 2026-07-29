-- Un bloqueo de academia de EasyCancha ("BLOQUEOS ACADEMIAS") no es UNA clase:
-- el 77% de los 529 bloques de jun–jul 2026 dura 2h o más (los hay de 6,5h) y
-- adentro caben varios grupos seguidos. Como la academia se paga fijo_por_clase
-- ($90k–$100k), registrar un bloque de 4h como una sola clase paga de menos.
--
-- Por eso al registrarlo se puede partir en N clases, y una reserva de EasyCancha
-- deja de ser única en `clases`. El calendario ya deduplica por "existe alguna
-- clase con este booking", no por unicidad.
drop index if exists public.clases_ec_booking_uidx;

create index if not exists clases_ec_booking_idx
  on public.clases (easycancha_booking_id)
  where easycancha_booking_id is not null;
