-- "Con revisión" del historial = solo lo que de verdad espera a alguien (Laura, 28-oct-2026). Contaba
-- también lo descartado (estado `rechazada`), y la firma repetida de Carlota, anulada el 22-oct, salía
-- con un "1" ámbar como si hubiera algo por hacer. Lo descartado sigue visible en "Todo".
-- Igual que 20261028210000 salvo la columna `revision`.

create or replace function public.registro_historial(
  p_solo_revision boolean default false,
  p_limite integer default 20,
  p_desde integer default 0
)
returns jsonb
language sql
stable
security invoker
set search_path to ''
as $$
  with s as (
    select id, tipo::text as tipo, estado::text as estado, created_at,
           case when miembro_id is null then id::text
                else coalesce(sesion_id::text, ((created_at at time zone 'America/Bogota')::date)::text) || ':' || miembro_id::text
           end as clave
      from public.registro_solicitud
  ), g as (
    select clave,
           min(created_at) as cuando,
           (array_agg(id order by created_at desc) filter (where tipo = 'datos'))[1] as datos_id,
           (array_agg(id order by created_at desc) filter (where tipo = 'consentimiento'))[1] as firma_id,
           bool_or(estado = 'en_revision') as revision
      from s
     group by clave
  ), f as (
    select * from g where not p_solo_revision or revision
  ), p as (
    select * from f order by cuando desc, clave
     limit greatest(p_limite, 1) offset greatest(p_desde, 0)
  )
  select jsonb_build_object(
    'total', (select count(*) from f),
    'filas', coalesce((select jsonb_agg(jsonb_build_object('clave', clave, 'cuando', cuando, 'datos_id', datos_id, 'firma_id', firma_id)
                                        order by cuando desc, clave) from p), '[]'::jsonb)
  );
$$;
