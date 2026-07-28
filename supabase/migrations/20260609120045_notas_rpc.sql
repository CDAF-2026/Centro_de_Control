-- ============================================================================
-- 0045 · RPC de lectura del módulo de Notas
-- ----------------------------------------------------------------------------
-- Una sola llamada devuelve la nota YA resuelta: nombre del autor, nombres de
-- los etiquetados (agregados en jsonb) y la etiqueta del enganche. Motivos:
--
--   1. Regla del proyecto: nada de traer filas masivas y agrupar en JS.
--      Sin esto serían N notas × M destinatarios filas y PostgREST corta en 1000.
--   2. `profiles_select` (0001) no deja que una recepcionista vea el nombre de
--      sus compañeros. SECURITY DEFINER resuelve los nombres sin abrir la tabla.
--
-- Es SECURITY DEFINER, así que replica a mano la regla de `notas_select`:
-- solo staff autenticado (auth.uid() no nulo).
-- ============================================================================

create or replace function public.notas_listar(
  p_filtro  text default 'todas',      -- 'mias' | 'todas' | 'resueltas'
  p_cliente bigint default null,       -- si viene, ignora el filtro y trae las de ese cliente
  p_limite  int default 100
)
returns table (
  id                  bigint,
  texto               text,
  autor_id            uuid,
  autor_nombre        text,
  prioridad           text,
  estado              text,
  para_todos          boolean,
  cliente_id          bigint,
  cliente_nombre      text,
  clase_id            bigint,
  clase_etiqueta      text,
  evento_id           bigint,
  evento_nombre       text,
  resuelta_por_nombre text,
  resuelta_el         timestamptz,
  editada_el          timestamptz,
  created_at          timestamptz,
  destinatarios       jsonb,
  soy_destinatario    boolean,
  leida_por_mi        boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    n.id,
    n.texto,
    n.autor_id,
    autor.nombre,
    n.prioridad,
    n.estado,
    n.para_todos,
    n.cliente_id,
    nullif(btrim(coalesce(c.nombres, '') || ' ' || coalesce(c.apellidos, '')), ''),
    n.clase_id,
    case when cl.id is not null
      then to_char(cl.fecha, 'DD/MM') || coalesce(' ' || to_char(cl.hora_inicio, 'HH24:MI'), '')
      else null end,
    n.evento_id,
    ev.nombre,
    res.nombre,
    n.resuelta_el,
    n.editada_el,
    n.created_at,
    coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id',     d.perfil_id,
                 'nombre', dp.nombre,
                 'leida',  d.leida_el is not null
               )
               order by dp.nombre nulls last
             )
      from public.nota_destinatarios d
      join public.profiles dp on dp.id = d.perfil_id
      where d.nota_id = n.id
    ), '[]'::jsonb),
    exists (
      select 1 from public.nota_destinatarios d
      where d.nota_id = n.id and d.perfil_id = (select auth.uid())
    ),
    coalesce((
      select d.leida_el is not null
      from public.nota_destinatarios d
      where d.nota_id = n.id and d.perfil_id = (select auth.uid())
    ), false)
  from public.notas n
  join      public.profiles autor on autor.id = n.autor_id
  left join public.profiles res   on res.id   = n.resuelta_por
  left join public.clientes c     on c.id     = n.cliente_id
  left join public.clases   cl    on cl.id    = n.clase_id
  left join public.eventos  ev    on ev.id    = n.evento_id
  where (select auth.uid()) is not null
    and case
          when p_cliente is not null then n.cliente_id = p_cliente
          when p_filtro = 'resueltas' then n.estado = 'resuelta'
          when p_filtro = 'mias' then
            n.estado = 'pendiente'
            and exists (
              select 1 from public.nota_destinatarios d
              where d.nota_id = n.id and d.perfil_id = (select auth.uid())
            )
          else n.estado = 'pendiente'
        end
  -- Las urgentes sin resolver arriba; después, lo más reciente primero.
  order by (n.estado = 'pendiente' and n.prioridad = 'alta') desc, n.created_at desc
  limit least(greatest(p_limite, 1), 200);
$$;

revoke all on function public.notas_listar(text, bigint, int) from public, anon;
grant execute on function public.notas_listar(text, bigint, int) to authenticated;

comment on function public.notas_listar(text, bigint, int) is
  'Notas del staff ya resueltas con nombres y destinatarios. Filtros: mias | todas | resueltas.';
