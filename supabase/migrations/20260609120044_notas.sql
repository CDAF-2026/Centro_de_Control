-- ============================================================================
-- 0044 · Módulo de Notas — recados entre empleados (relevo de turno)
-- ----------------------------------------------------------------------------
-- Bandeja interna del staff: quien está en caja deja un recado para el turno
-- siguiente ("el cliente X no pagó", "se cancela la academia de la tarde").
--
-- Modelo: una nota puede etiquetar responsables (@) o ir al tablón general
-- (`para_todos`). En ambos casos se crean filas en `nota_destinatarios`; es
-- esa tabla la que alimenta el contador de no leídas y el aviso en vivo
-- (Realtime), vía `leida_el`.
--
--   · nota con @X, @Y  → destinatarios = X, Y            (para_todos = false)
--   · nota sin etiquetar → destinatarios = staff activo   (para_todos = true)
--     (en ambos casos se excluye al autor: no se avisa a sí mismo)
-- ============================================================================

create table public.notas (
  id           bigint generated always as identity primary key,
  texto        text not null check (length(btrim(texto)) between 1 and 2000),
  autor_id     uuid not null references public.profiles (id) on delete cascade,
  prioridad    text not null default 'normal' check (prioridad in ('normal', 'alta')),
  estado       text not null default 'pendiente' check (estado in ('pendiente', 'resuelta')),
  para_todos   boolean not null default false,
  -- Enganche opcional con el resto del sistema (la nota deja de ser texto suelto).
  cliente_id   bigint references public.clientes (id) on delete set null,
  clase_id     bigint references public.clases (id) on delete set null,
  evento_id    bigint references public.eventos (id) on delete set null,
  resuelta_por uuid references public.profiles (id) on delete set null,
  resuelta_el  timestamptz,
  editada_el   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.notas is
  'Recados internos del staff (relevo de turno). Ver nota_destinatarios para el aviso.';

create index notas_created_idx on public.notas (created_at desc);
create index notas_estado_idx  on public.notas (estado);
create index notas_cliente_idx on public.notas (cliente_id) where cliente_id is not null;
create index notas_clase_idx   on public.notas (clase_id)   where clase_id is not null;
create index notas_evento_idx  on public.notas (evento_id)  where evento_id is not null;

create trigger notas_set_updated_at
  before update on public.notas
  for each row execute function private.set_updated_at();

-- ─────────────────── A quién va la nota (y si ya la leyó) ───────────────────
create table public.nota_destinatarios (
  id         bigint generated always as identity primary key,
  nota_id    bigint not null references public.notas (id) on delete cascade,
  perfil_id  uuid   not null references public.profiles (id) on delete cascade,
  leida_el   timestamptz,
  created_at timestamptz not null default now(),
  unique (nota_id, perfil_id)
);

comment on table public.nota_destinatarios is
  'Destinatarios de una nota. leida_el = null alimenta el contador de no leídas.';

-- Índice parcial: el contador de la campanita solo mira las no leídas.
create index nota_dest_pendientes_idx on public.nota_destinatarios (perfil_id)
  where leida_el is null;
create index nota_dest_nota_idx on public.nota_destinatarios (nota_id);

-- ───────── Directorio del staff (para etiquetar @ y mostrar autores) ─────────
-- `profiles_select` (0001) solo deja ver el propio perfil salvo a SA/CA, así que
-- una recepcionista no podría ver a sus compañeros para etiquetarlos. Esta
-- función expone SOLO nombre y rol de la gente activa — nunca documento ni
-- teléfono — sin tener que abrir la política de `profiles`.
create or replace function public.staff_directorio()
returns table (id uuid, nombre text, role public.app_role)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.nombre, p.role
  from public.profiles p
  where p.activo
  order by p.nombre nulls last;
$$;
revoke all on function public.staff_directorio() from public, anon;
grant execute on function public.staff_directorio() to authenticated;

-- ─────────────────────────── Grants + RLS ───────────────────────────
grant select, insert, update, delete on public.notas to authenticated;
grant select, insert, update, delete on public.nota_destinatarios to authenticated;
alter table public.notas enable row level security;
alter table public.nota_destinatarios enable row level security;

-- Leer: todo el staff. Es un tablón interno; ocultarlo por rol lo haría inútil
-- (el relevo de turno cruza recepción, coordinación y profesores).
create policy "notas_select" on public.notas for select to authenticated
  using (true);

-- Crear: cualquier miembro del staff, siempre firmando como sí mismo.
create policy "notas_insert" on public.notas for insert to authenticated
  with check (autor_id = (select auth.uid()));

-- Editar / resolver / reabrir: el autor, quien está etiquetado, o SA/CA.
create policy "notas_update" on public.notas for update to authenticated
  using (
    autor_id = (select auth.uid())
    or private.user_role() in ('superadmin', 'coord_admin')
    or exists (
      select 1 from public.nota_destinatarios d
      where d.nota_id = notas.id and d.perfil_id = (select auth.uid())
    )
  )
  with check (
    autor_id = (select auth.uid())
    or private.user_role() in ('superadmin', 'coord_admin')
    or exists (
      select 1 from public.nota_destinatarios d
      where d.nota_id = notas.id and d.perfil_id = (select auth.uid())
    )
  );

-- Borrar: solo el autor o el superadministrador.
create policy "notas_delete" on public.notas for delete to authenticated
  using (autor_id = (select auth.uid()) or private.user_role() = 'superadmin');

-- Ver a quién va cada nota: todo el staff.
create policy "nota_dest_select" on public.nota_destinatarios for select to authenticated
  using (true);

-- Etiquetar: solo el autor de la nota (o SA/CA al reasignar).
create policy "nota_dest_insert" on public.nota_destinatarios for insert to authenticated
  with check (
    exists (
      select 1 from public.notas n
      where n.id = nota_destinatarios.nota_id
        and (n.autor_id = (select auth.uid())
             or private.user_role() in ('superadmin', 'coord_admin'))
    )
  );

-- Marcar como leída: solo tu propia fila.
create policy "nota_dest_update" on public.nota_destinatarios for update to authenticated
  using (perfil_id = (select auth.uid()))
  with check (perfil_id = (select auth.uid()));

-- Quitar un etiquetado: el autor de la nota o SA/CA.
create policy "nota_dest_delete" on public.nota_destinatarios for delete to authenticated
  using (
    exists (
      select 1 from public.notas n
      where n.id = nota_destinatarios.nota_id
        and (n.autor_id = (select auth.uid())
             or private.user_role() in ('superadmin', 'coord_admin'))
    )
  );

-- ─────────────────── Aviso en vivo (Supabase Realtime) ───────────────────
-- El navegador se suscribe a sus propias filas para que el contador salte solo.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'nota_destinatarios'
  ) then
    alter publication supabase_realtime add table public.nota_destinatarios;
  end if;
end
$$;
