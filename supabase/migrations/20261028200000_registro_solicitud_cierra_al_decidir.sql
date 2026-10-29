-- Una solicitud de datos que quedó `en_revision` solo por su facturación se cierra sola cuando se
-- decide el último cambio (28-oct-2026). `registro_aplicar_datos` la deja en revisión si hay cambios
-- pendientes, pero nada la devolvía a `aplicada` al aprobarlos o rechazarlos: el historial de la
-- bandeja seguía diciendo "En revisión · N de facturación por aprobar" y el filtro "Con revisión"
-- contaba 17 solicitudes ya resueltas. Va en un trigger, no en `registro_facturacion_decidir`, para
-- que también lo cumplan las aprobaciones hechas a mano al unir fichas.

create or replace function private.registro_solicitud_cerrar_si_decidida()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.estado <> 'pendiente' and old.estado = 'pendiente'
     and not exists (select 1 from public.registro_cambio
                      where solicitud_id = new.solicitud_id and estado = 'pendiente') then
    update public.registro_solicitud
       set estado = 'aplicada',
           revisada_por = coalesce(revisada_por, new.decidido_por),
           revisada_el = coalesce(revisada_el, new.decidido_el, now())
     where id = new.solicitud_id
       and estado = 'en_revision'
       and cliente_id is not null;
  end if;
  return null;
end;
$$;

drop trigger if exists registro_cambio_cierra_solicitud on public.registro_cambio;
create trigger registro_cambio_cierra_solicitud
  after update of estado on public.registro_cambio
  for each row execute function private.registro_solicitud_cerrar_si_decidida();

-- Las que ya estaban resueltas (medido el 28-oct-2026: 17, todas con su facturación aprobada).
update public.registro_solicitud s
   set estado = 'aplicada',
       revisada_por = coalesce(s.revisada_por, d.decidido_por),
       revisada_el = coalesce(s.revisada_el, d.decidido_el, now())
  from (select solicitud_id, max(decidido_el) as decidido_el,
               (array_agg(decidido_por order by decidido_el desc nulls last))[1] as decidido_por
          from public.registro_cambio group by solicitud_id) d
 where d.solicitud_id = s.id
   and s.estado = 'en_revision'
   and s.cliente_id is not null
   and not exists (select 1 from public.registro_cambio rc where rc.solicitud_id = s.id and rc.estado = 'pendiente');
