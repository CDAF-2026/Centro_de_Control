-- `siigo_catalogo_aplicar` tolera un producto repetido en el catálogo (25-sep-2026).
-- Si el club crea o borra productos mientras el sync pagina, Siigo puede devolver el mismo
-- código en dos páginas, y el upsert fallaba con "ON CONFLICT DO UPDATE command cannot
-- affect row a second time" — o sea, el sync entero se caía. Lo cazó la prueba
-- tests/siigo-catalogo.test.ts. Único cambio: DISTINCT ON (codigo) al leer el catálogo.

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
