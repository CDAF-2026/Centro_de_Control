-- Historial de la bandeja de registros, una fila por persona y visita y de 20 en 20 (28-oct-2026,
-- opción A de Laura). Agrupar y paginar en la página leía las últimas 200 solicitudes y armaba las
-- filas en JS; con el paginador eso tenía que contar TODAS, y PostgREST corta a 1000 (regla 2).
-- Junta los datos y la firma de la misma persona en la misma visita (`sesion_id`; las solicitudes
-- viejas sin sesión, por día de Bogotá); una sin miembro va sola. "Con revisión" = alguna de las
-- dos quedó en revisión o descartada. SECURITY INVOKER: la RLS de registro_solicitud (SA y coord.
-- administrativo) sigue mandando.

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
           bool_or(estado in ('en_revision', 'rechazada')) as revision
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

revoke all on function public.registro_historial(boolean, integer, integer) from public, anon;
grant execute on function public.registro_historial(boolean, integer, integer) to authenticated, service_role;
