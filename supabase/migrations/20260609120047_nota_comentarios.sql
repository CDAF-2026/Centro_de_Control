-- ============================================================================
-- 0047 · Comentarios en las notas (hilo de respuestas)
-- ----------------------------------------------------------------------------
-- Una nota se puede responder: "ya lo llamé", "listo, pagó". El hilo va plegado
-- dentro del post-it; la tarjeta solo muestra el contador.
--
-- Aviso: comentar vuelve a poner la nota "sin abrir" para los involucrados
-- (`nota_destinatarios.leida_el = null`), así que reaparece en la campanita sin
-- necesidad de un sistema de notificaciones aparte.
--
-- Quiénes son "los involucrados" (decisión de Laura, 28-jul-2026):
--   · el autor de la nota
--   · quienes ya habían comentado
--   · quien sea etiquetado con @ en el comentario
--   · los responsables etiquetados en la nota — SOLO si la nota tiene
--     responsables. Si es del tablón general (`para_todos`), NO se vuelve a
--     avisar a todo el staff: sería ruido en dos días.
-- Nunca se avisa a quien acaba de escribir el comentario.
-- ============================================================================

create table public.nota_comentarios (
  id         bigint generated always as identity primary key,
  nota_id    bigint not null references public.notas (id) on delete cascade,
  autor_id   uuid   not null references public.profiles (id) on delete cascade,
  texto      text   not null check (length(btrim(texto)) between 1 and 1000),
  editado_el timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.nota_comentarios is
  'Respuestas a una nota. El aviso se maneja reabriendo leida_el en nota_destinatarios.';

create index nota_com_nota_idx on public.nota_comentarios (nota_id, created_at);

grant select, insert, update, delete on public.nota_comentarios to authenticated;
alter table public.nota_comentarios enable row level security;

create policy "nota_com_select" on public.nota_comentarios for select to authenticated
  using (true);

-- Comentar: cualquiera del staff, siempre firmando como sí mismo.
create policy "nota_com_insert" on public.nota_comentarios for insert to authenticated
  with check (autor_id = (select auth.uid()));

-- Editar: solo lo propio (ni siquiera un coordinador reescribe a otro).
create policy "nota_com_update" on public.nota_comentarios for update to authenticated
  using (autor_id = (select auth.uid()))
  with check (autor_id = (select auth.uid()));

-- Borrar: lo propio, o el superadministrador para moderar.
create policy "nota_com_delete" on public.nota_comentarios for delete to authenticated
  using (autor_id = (select auth.uid()) or private.user_role() = 'superadmin');

-- ─────────────────── Comentar + repartir el aviso (atómico) ───────────────────
-- Va en una función SECURITY DEFINER porque `nota_dest_insert` solo deja
-- etiquetar al autor de la nota: quien comenta necesita poder avisarle al autor
-- (y a los demás) sin ser dueño de la nota.
create or replace function public.nota_comentar(
  p_nota_id       bigint,
  p_texto         text,
  p_destinatarios uuid[] default '{}'      -- etiquetados con @ dentro del comentario
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid           uuid := (select auth.uid());
  v_id            bigint;
  v_involucrados  uuid[];
begin
  if v_uid is null then
    raise exception 'Se necesita una sesión activa.';
  end if;
  if p_texto is null or length(btrim(p_texto)) = 0 then
    raise exception 'El comentario no puede ir vacío.';
  end if;
  if not exists (select 1 from public.notas where id = p_nota_id) then
    raise exception 'La nota no existe.';
  end if;

  insert into public.nota_comentarios (nota_id, autor_id, texto)
  values (p_nota_id, v_uid, btrim(p_texto))
  returning id into v_id;

  select array_agg(distinct x.perfil) into v_involucrados
  from (
    select n.autor_id as perfil
      from public.notas n
     where n.id = p_nota_id
    union
    select c.autor_id
      from public.nota_comentarios c
     where c.nota_id = p_nota_id
    union
    select unnest(coalesce(p_destinatarios, '{}'::uuid[]))
    union
    -- Responsables de la nota, salvo que sea tablón general.
    select d.perfil_id
      from public.nota_destinatarios d
      join public.notas n2 on n2.id = d.nota_id
     where d.nota_id = p_nota_id and not n2.para_todos
  ) x
  where x.perfil is not null;

  v_involucrados := array_remove(coalesce(v_involucrados, '{}'::uuid[]), v_uid);

  if array_length(v_involucrados, 1) > 0 then
    -- Los que aún no estaban en la nota entran ahora (así el autor recibe respuestas).
    insert into public.nota_destinatarios (nota_id, perfil_id)
    select p_nota_id, p from unnest(v_involucrados) as p
    on conflict (nota_id, perfil_id) do nothing;

    -- Y a todos ellos les vuelve a aparecer como "sin abrir".
    update public.nota_destinatarios
       set leida_el = null
     where nota_id = p_nota_id
       and perfil_id = any (v_involucrados);
  end if;

  -- Quien comenta, obviamente, ya la vio.
  update public.nota_destinatarios
     set leida_el = now()
   where nota_id = p_nota_id and perfil_id = v_uid and leida_el is null;

  return v_id;
end;
$$;

revoke all on function public.nota_comentar(bigint, text, uuid[]) from public, anon;
grant execute on function public.nota_comentar(bigint, text, uuid[]) to authenticated;

-- ─────────────────── Hilo de una nota (con nombres resueltos) ───────────────────
create or replace function public.nota_comentarios_listar(p_nota_id bigint)
returns table (
  id           bigint,
  autor_id     uuid,
  autor_nombre text,
  texto        text,
  editado_el   timestamptz,
  created_at   timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.autor_id, a.nombre, c.texto, c.editado_el, c.created_at
  from public.nota_comentarios c
  join public.profiles a on a.id = c.autor_id
  where (select auth.uid()) is not null
    and c.nota_id = p_nota_id
  order by c.created_at;
$$;

revoke all on function public.nota_comentarios_listar(bigint) from public, anon;
grant execute on function public.nota_comentarios_listar(bigint) to authenticated;

-- ─────────── notas_listar: contador de comentarios + "Para mí" real ───────────
-- Cambia el tipo de retorno (entra `n_comentarios`), así que hay que recrearla.
--
-- El filtro 'mias' pasa a ser "lo que requiere mi atención": pendientes MÁS
-- cualquier nota sin abrir aunque ya esté resuelta. Sin esto, comentar una nota
-- resuelta encendía la campanita y la pestaña salía vacía.
drop function if exists public.notas_listar(text, bigint, int);

create or replace function public.notas_listar(
  p_filtro  text default 'todas',      -- 'mias' | 'todas' | 'resueltas' | 'sin_leer'
  p_cliente bigint default null,
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
  leida_por_mi        boolean,
  n_comentarios       int
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
    ), false),
    (select count(*)::int from public.nota_comentarios cm where cm.nota_id = n.id)
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
$$;

revoke all on function public.notas_listar(text, bigint, int) from public, anon;
grant execute on function public.notas_listar(text, bigint, int) to authenticated;

comment on function public.notas_listar(text, bigint, int) is
  'Notas del staff ya resueltas con nombres, destinatarios y nº de comentarios. Filtros: mias | todas | resueltas | sin_leer.';

notify pgrst, 'reload schema';
