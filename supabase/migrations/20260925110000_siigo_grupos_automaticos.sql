-- Grupos de Siigo reconocidos solos (25-sep-2026, pedido de Laura).
--
-- El sync casaba cada línea con su servicio por el NOMBRE del grupo de producto de Siigo.
-- Eso falló dos veces, en silencio:
--   · 30-jul-2026: el club RENOMBRÓ los cuatro grupos de academia y esa plata dejó de verse.
--   · 22-sep-2026: el club CREÓ "Alianzas colegios" y su primera venta salió "Sin categoría".
--
-- Ahora:
--   1. Cada servicio guarda el NÚMERO del grupo en Siigo (`siigo_grupo_id`), que no cambia
--      aunque le cambien el nombre. Casar por número hace que un renombre no rompa nada.
--   2. Si el club RENOMBRA un grupo, el servicio toma el nombre nuevo solo (decisión de Laura).
--   3. Si aparece un grupo NUEVO con productos, se crea su servicio con el nombre de Siigo y
--      sin color (sale en el gris por defecto hasta que se le asigne uno validado).
--   4. En los dos casos llega una nota a los superadministradores, firmada como
--      "Aviso automático" (autor null), para que alguien revise.
--
-- Todo vive en UNA función (`siigo_catalogo_aplicar`) que llaman los tres sitios que leen el
-- catálogo de Siigo: el sync de consola, la Edge Function y `sync:productos`. Antes cada uno
-- tenía su copia del emparejamiento y la de `sync:productos` ya se había quedado sin la regla
-- de los códigos de matrícula.

-- ─── 1. Número del grupo ───────────────────────────────────────────────────────────────
alter table public.servicios add column siigo_grupo_id integer;
create unique index servicios_siigo_grupo_id_key on public.servicios (siigo_grupo_id);
comment on column public.servicios.siigo_grupo_id is
  'Id del grupo de producto (account_group) en Siigo. Es la llave del emparejamiento: no cambia al renombrar el grupo. siigo_grupo guarda el nombre actual.';

alter table public.siigo_productos add column account_group_id integer;

-- Los 20 grupos que tenía Siigo el 25-sep-2026 (GET /v1/account-groups). El 12083
-- (CONVENIOS COLEGIOS) no se enlaza: su único producto (AF683) lo reclama "Alianzas colegios"
-- por código.
update public.servicios s
   set siigo_grupo_id = g.id
  from (values
    (1031, 'Producto Generico'), (2006, 'Alquiler Padel'), (2007, 'Alquiler Tenis'),
    (2008, 'Academia recreativa tenis'), (2009, 'Academia recreativa padel'), (2010, 'Almacen'),
    (2011, 'Academia competencia tenis'), (2012, 'Clases de Padel'), (2013, 'Clases de Tenis'),
    (2014, 'Cafeteria'), (2018, 'Patrocinio Torneo'), (2023, 'Torneos'), (2040, 'Patrocinio'),
    (2041, 'Comisión punto de entrega'), (2078, 'Preparación física'),
    (12079, 'Alto rendimiento Joaquin'), (12086, 'VACACIONALES RECREATVIOS'),
    (12095, 'Academia competencia padel'), (12100, 'Alianzas colegios')
  ) as g(id, nombre)
 where lower(btrim(s.siigo_grupo)) = lower(btrim(g.nombre));

-- ─── 2. Notas firmadas por el sistema ──────────────────────────────────────────────────
alter table public.notas alter column autor_id drop not null;
comment on column public.notas.autor_id is
  'Quién escribió la nota. NULL = aviso automático del sistema (p. ej. un grupo nuevo en Siigo).';

-- El candado comparaba con `<>`, y `null <> uid` es NULL → dejaba editar la nota a cualquiera.
create or replace function public.notas_solo_autor_edita()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  if (
       new.texto      is distinct from old.texto
    or new.prioridad  is distinct from old.prioridad
    or new.para_todos is distinct from old.para_todos
    or new.autor_id   is distinct from old.autor_id
  ) and old.autor_id is distinct from (select auth.uid())
  then
    raise exception 'Solo quien escribió la nota puede editar su contenido.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

-- notas_listar: el autor pasa a LEFT JOIN (con JOIN, las notas automáticas no saldrían).
create or replace function public.notas_listar(p_filtro text default 'todas'::text, p_cliente bigint default null::bigint, p_limite integer default 100)
 returns table(id bigint, texto text, autor_id uuid, autor_nombre text, prioridad text, estado text, para_todos boolean, cliente_id bigint, cliente_nombre text, clase_id bigint, clase_etiqueta text, evento_id bigint, evento_nombre text, resuelta_por_nombre text, resuelta_el timestamp with time zone, editada_el timestamp with time zone, created_at timestamp with time zone, destinatarios jsonb, soy_destinatario boolean, leida_por_mi boolean, n_comentarios integer)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select
    n.id,
    n.texto,
    n.autor_id,
    case when n.autor_id is null then 'Aviso automático' else autor.nombre end,
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
    ), false),
    (select count(*)::int from public.nota_comentarios cm where cm.nota_id = n.id)
  from public.notas n
  left join public.profiles autor on autor.id = n.autor_id
  left join public.profiles res   on res.id   = n.resuelta_por
  left join public.clientes c     on c.id     = n.cliente_id
  left join public.clases   cl    on cl.id    = n.clase_id
  left join public.eventos  ev    on ev.id    = n.evento_id
  where (select auth.uid()) is not null
    and case
          when p_cliente is not null then n.cliente_id = p_cliente
          when p_filtro = 'resueltas' then n.estado = 'resuelta'
          when p_filtro = 'sin_leer' then
            exists (
              select 1 from public.nota_destinatarios d
              where d.nota_id = n.id
                and d.perfil_id = (select auth.uid())
                and d.leida_el is null
            )
          when p_filtro = 'mias' then
            exists (
              select 1 from public.nota_destinatarios d
              where d.nota_id = n.id
                and d.perfil_id = (select auth.uid())
                -- pendiente, o resuelta pero todavía sin abrir
                and (n.estado = 'pendiente' or d.leida_el is null)
            )
          else n.estado = 'pendiente'
        end
  order by (n.estado = 'pendiente' and n.prioridad = 'alta') desc, n.created_at desc
  limit least(greatest(p_limite, 1), 200);
$function$;

-- Nota del sistema a todos los superadministradores activos.
create or replace function private.nota_sistema_superadmins(p_texto text)
returns bigint
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_id bigint;
begin
  insert into public.notas (texto, autor_id, prioridad)
  values (p_texto, null, 'normal')
  returning id into v_id;

  insert into public.nota_destinatarios (nota_id, perfil_id)
  select v_id, p.id from public.profiles p where p.role = 'superadmin' and p.activo;

  return v_id;
end;
$$;
revoke all on function private.nota_sistema_superadmins(text) from public, anon, authenticated;

-- ─── 3. El catálogo de Siigo, en un solo sitio ─────────────────────────────────────────
-- p_productos: [{ "codigo", "nombre", "grupo_id", "grupo" }] — el catálogo COMPLETO de Siigo.
-- Devuelve { "servicio_por_codigo": {codigo: servicio_id|null}, "creados": [...],
--            "renombrados": [...], "lineas_recategorizadas": n }.
-- p_simulacro = true: calcula y devuelve todo, pero revierte (lo usa `sync:productos --dry`).
create or replace function public.siigo_catalogo_aplicar(p_productos jsonb, p_simulacro boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  g             record;
  sv            public.servicios%rowtype;
  v_creados     jsonb := '[]'::jsonb;
  v_renombrados jsonb := '[]'::jsonb;
  v_lineas      int := 0;
  v_mapa        jsonb;
  v_resultado   jsonb;
begin
  drop table if exists pg_temp._prod;
  drop table if exists pg_temp._map;
  -- DISTINCT ON: si el catálogo cambia mientras se pagina, Siigo puede repetir un producto
  -- en dos páginas, y el upsert de abajo no acepta el mismo código dos veces.
  create temp table _prod on commit drop as
  select distinct on (btrim(x.codigo)) btrim(x.codigo) as codigo, x.nombre, x.grupo_id, nullif(btrim(x.grupo), '') as grupo
    from jsonb_to_recordset(coalesce(p_productos, '[]'::jsonb))
         as x(codigo text, nombre text, grupo_id integer, grupo text)
   where nullif(btrim(x.codigo), '') is not null;

  -- a) Grupos: enlazar, renombrar o crear.
  for g in
    select grupo_id as id, min(grupo) as nombre, array_agg(codigo) as codigos
      from pg_temp._prod
     where grupo_id is not null and grupo is not null
     group by grupo_id
     order by grupo_id
  loop
    select * into sv from public.servicios where siigo_grupo_id = g.id;

    if found then
      -- Ya enlazado. ¿Lo renombraron en Siigo?
      if btrim(coalesce(sv.siigo_grupo, '')) is distinct from g.nombre then
        update public.servicios set siigo_grupo = g.nombre, nombre = g.nombre where id = sv.id;
        insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
        values (null, 'servicio.renombrado_en_siigo', 'servicios', sv.id::text,
                jsonb_build_object('nombre', sv.nombre, 'siigo_grupo', sv.siigo_grupo),
                jsonb_build_object('nombre', g.nombre, 'siigo_grupo', g.nombre, 'siigo_grupo_id', g.id));
        perform private.nota_sistema_superadmins(format(
          'En Siigo renombraron el grupo de productos «%s» como «%s». En la plataforma el servicio «%s» ahora se llama «%s» y su facturación sigue contándose igual. No hay que hacer nada, es solo para que lo sepas.',
          sv.siigo_grupo, g.nombre, sv.nombre, g.nombre));
        v_renombrados := v_renombrados || jsonb_build_object('servicio_id', sv.id, 'antes', sv.nombre, 'ahora', g.nombre);
      end if;
      continue;
    end if;

    -- Sin número todavía: ¿algún servicio lo reclama por nombre? Se enlaza en silencio.
    select * into sv from public.servicios
     where siigo_grupo_id is null and lower(btrim(siigo_grupo)) = lower(g.nombre)
     order by id limit 1;
    if found then
      update public.servicios set siigo_grupo_id = g.id where id = sv.id;
      continue;
    end if;

    -- ¿Todos sus productos ya los reclama algún servicio por código? Entonces no es plata
    -- sin dueño (caso de CONVENIOS COLEGIOS: su único producto lo reclama Alianzas colegios).
    if not exists (
      select 1 from unnest(g.codigos) c
       where not exists (
         select 1 from public.servicios s2, unnest(s2.siigo_codigos) sc
          where upper(btrim(sc)) = upper(c))
    ) then
      continue;
    end if;

    -- Grupo nuevo: se crea su servicio con el nombre de Siigo.
    insert into public.servicios (clave, nombre, color, siigo_grupo, siigo_grupo_id, orden)
    values ('siigo_' || g.id, g.nombre, null, g.nombre, g.id,
            (select coalesce(max(orden), 0) + 1 from public.servicios))
    returning * into sv;
    insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
    values (null, 'servicio.creado_desde_siigo', 'servicios', sv.id::text, null,
            jsonb_build_object('nombre', g.nombre, 'siigo_grupo_id', g.id, 'productos', to_jsonb(g.codigos)));
    perform private.nota_sistema_superadmins(format(
      'En Siigo apareció un grupo de productos nuevo: «%s» (%s producto%s). La plataforma ya creó un servicio con ese nombre, así que su facturación se ve en el dashboard desde ya, en color gris. Revisa si de verdad es un servicio nuevo o si es el mismo que uno que ya existe con otro nombre; en ese caso hay que unirlos. Si crece, pide que le asignen un color.',
      g.nombre, cardinality(g.codigos), case when cardinality(g.codigos) = 1 then '' else 's' end));
    v_creados := v_creados || jsonb_build_object('servicio_id', sv.id, 'nombre', g.nombre, 'siigo_grupo_id', g.id);
  end loop;

  -- b) Servicio de cada producto: el CÓDIGO le gana al grupo (matrículas, migración 0072),
  --    después el NÚMERO del grupo y, de respaldo, su nombre.
  create temp table _map on commit drop as
  select p.codigo, p.nombre, p.grupo, p.grupo_id,
         coalesce(
           (select s.id from public.servicios s, unnest(s.siigo_codigos) sc
             where upper(btrim(sc)) = upper(p.codigo) order by s.id limit 1),
           (select s.id from public.servicios s where s.siigo_grupo_id = p.grupo_id),
           (select s.id from public.servicios s
             where lower(btrim(s.siigo_grupo)) = lower(p.grupo) order by s.id limit 1)
         ) as servicio_id
    from pg_temp._prod p;

  insert into public.siigo_productos (codigo, nombre, account_group, account_group_id, servicio_id, updated_at)
  select codigo, nombre, grupo, grupo_id, servicio_id, now() from pg_temp._map
  on conflict (codigo) do update
     set nombre = excluded.nombre,
         account_group = excluded.account_group,
         account_group_id = excluded.account_group_id,
         servicio_id = excluded.servicio_id,
         updated_at = excluded.updated_at;

  -- c) Líneas que entraron sin categoría y ahora sí tienen servicio. Solo las NULL: las que
  --    ya tienen categoría pueden traer una corrección manual y no se tocan.
  update public.siigo_factura_lineas l
     set servicio_id = m.servicio_id
    from pg_temp._map m
   where l.codigo = m.codigo
     and l.servicio_id is null
     and m.servicio_id is not null;
  get diagnostics v_lineas = row_count;

  select coalesce(jsonb_object_agg(codigo, servicio_id), '{}'::jsonb) into v_mapa from pg_temp._map;

  v_resultado := jsonb_build_object(
    'servicio_por_codigo', v_mapa,
    'creados', v_creados,
    'renombrados', v_renombrados,
    'lineas_recategorizadas', v_lineas);

  if p_simulacro then
    -- Deshace todo lo de arriba y devuelve lo que habría pasado.
    raise exception using errcode = 'P0001', message = 'SIMULACRO', detail = v_resultado::text;
  end if;

  return v_resultado;
end;
$$;

revoke all on function public.siigo_catalogo_aplicar(jsonb, boolean) from public, anon, authenticated;
grant execute on function public.siigo_catalogo_aplicar(jsonb, boolean) to service_role;
