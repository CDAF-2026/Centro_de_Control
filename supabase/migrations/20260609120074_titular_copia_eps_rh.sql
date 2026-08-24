-- ============================================================================
-- 0074 · El espejo del titular también copia EPS y RH
-- ----------------------------------------------------------------------------
-- 0073 agregó eps/rh a clientes y cliente_miembros. Los triggers de 0066 que
-- crean y mantienen la fila de titular en cliente_miembros se escribieron antes
-- de que esos campos existieran, así que no los copiaban: un cliente nuevo (o un
-- backfill que escriba directo en clientes) dejaba al titular sin EPS/RH. Se
-- extienden las dos funciones para incluirlos y que la invariante siga completa.
-- ============================================================================

create or replace function private.clientes_crear_titular()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.cliente_miembros
    (cliente_id, nombres, apellidos, fecha_nacimiento, documento, tipo_documento, eps, rh, deportes, es_titular)
  values
    (new.id, new.nombres, new.apellidos, new.fecha_nacimiento, new.documento,
     new.tipo_documento, new.eps, new.rh, coalesce(new.deportes, '{}'), true)
  on conflict do nothing;
  return new;
end;
$$;

create or replace function private.clientes_sincronizar_titular()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.cliente_miembros
     set nombres          = new.nombres,
         apellidos        = new.apellidos,
         fecha_nacimiento = new.fecha_nacimiento,
         documento        = new.documento,
         tipo_documento   = new.tipo_documento,
         eps              = new.eps,
         rh               = new.rh,
         deportes         = coalesce(new.deportes, '{}')
   where cliente_id = new.id
     and es_titular;
  return new;
end;
$$;
