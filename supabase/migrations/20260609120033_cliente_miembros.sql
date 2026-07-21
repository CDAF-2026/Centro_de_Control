-- ============================================================================
-- 0033 · H1 · Hermanos: la ficha del cliente pasa a ser la cuenta de la familia
-- ----------------------------------------------------------------------------
-- Cuando vienen hermanos, el centro maneja UNA sola cuenta (siempre pagan
-- juntos). Entonces la ficha (clientes) = la familia, y adentro viven los
-- MIEMBROS (los hermanos). El titular también es un miembro, así toda la
-- operación funciona parejo.
--
--   Nivel FICHA (compartido): acudiente, contacto, documentos y la situación
--     financiera de Siigo → queda consolidada sola, sin tocar nada de dinero.
--   Nivel MIEMBRO (cada hermano): inscripciones, asistencia, clases, paquetes,
--     lista de espera y participación en eventos → para cobrar por sesión
--     asistida de cada niño y liquidar bien al profesor.
-- ============================================================================

create table public.cliente_miembros (
  id               bigint generated always as identity primary key,
  cliente_id       bigint not null references public.clientes (id) on delete cascade,
  nombres          text not null,
  apellidos        text not null,
  fecha_nacimiento date,
  documento        text,
  deportes         deporte[] not null default '{}',
  es_titular       boolean not null default false,
  activo           boolean not null default true,
  created_at       timestamptz not null default now()
);

create index cliente_miembros_cliente_idx on public.cliente_miembros (cliente_id);
-- Un solo titular por ficha.
create unique index cliente_miembros_titular_idx
  on public.cliente_miembros (cliente_id) where es_titular;

comment on table public.cliente_miembros is
  'Miembros de la ficha familiar (el titular y sus hermanos). La plata va a nivel de clientes; la operación va a nivel de miembro.';

alter table public.cliente_miembros enable row level security;

create policy "cliente_miembros_select" on public.cliente_miembros for select to authenticated
  using (private.user_role() in ('superadmin','coord_admin','coord_deportivo','recepcion','profesor'));
create policy "cliente_miembros_write" on public.cliente_miembros for all to authenticated
  using (private.user_role() in ('superadmin','coord_admin','recepcion'))
  with check (private.user_role() in ('superadmin','coord_admin','recepcion'));

-- ─────────────── La operación pasa a colgar del miembro ───────────────
alter table public.inscripciones        add column if not exists miembro_id bigint references public.cliente_miembros (id) on delete cascade;
alter table public.asistencias          add column if not exists miembro_id bigint references public.cliente_miembros (id) on delete cascade;
alter table public.clases               add column if not exists miembro_id bigint references public.cliente_miembros (id) on delete set null;
alter table public.paquetes_cliente     add column if not exists miembro_id bigint references public.cliente_miembros (id) on delete cascade;
alter table public.lista_espera         add column if not exists miembro_id bigint references public.cliente_miembros (id) on delete cascade;
alter table public.evento_participantes add column if not exists miembro_id bigint references public.cliente_miembros (id) on delete set null;

create index if not exists inscripciones_miembro_idx        on public.inscripciones (miembro_id);
create index if not exists asistencias_miembro_idx          on public.asistencias (miembro_id);
create index if not exists clases_miembro_idx               on public.clases (miembro_id);
create index if not exists paquetes_cliente_miembro_idx     on public.paquetes_cliente (miembro_id);
create index if not exists evento_participantes_miembro_idx on public.evento_participantes (miembro_id);

-- ─────────────── Backfill: cada cliente actual se vuelve su propio titular ───────────────
insert into public.cliente_miembros (cliente_id, nombres, apellidos, fecha_nacimiento, documento, deportes, es_titular)
select c.id, c.nombres, c.apellidos, c.fecha_nacimiento, c.documento, c.deportes, true
from public.clientes c
where not exists (select 1 from public.cliente_miembros m where m.cliente_id = c.id and m.es_titular);

-- Toda la operación existente queda atada al titular (nada se mueve de sitio).
update public.inscripciones t set miembro_id = m.id
  from public.cliente_miembros m where m.cliente_id = t.cliente_id and m.es_titular and t.miembro_id is null;
update public.asistencias t set miembro_id = m.id
  from public.cliente_miembros m where m.cliente_id = t.cliente_id and m.es_titular and t.miembro_id is null;
update public.clases t set miembro_id = m.id
  from public.cliente_miembros m where m.cliente_id = t.cliente_id and m.es_titular and t.miembro_id is null;
update public.paquetes_cliente t set miembro_id = m.id
  from public.cliente_miembros m where m.cliente_id = t.cliente_id and m.es_titular and t.miembro_id is null;
update public.lista_espera t set miembro_id = m.id
  from public.cliente_miembros m where m.cliente_id = t.cliente_id and m.es_titular and t.miembro_id is null;
update public.evento_participantes t set miembro_id = m.id
  from public.cliente_miembros m where m.cliente_id = t.cliente_id and m.es_titular and t.miembro_id is null;

-- La restricción de "ya inscrito" pasa a ser por MIEMBRO, no por ficha:
-- dos hermanos de la misma familia sí pueden estar en la misma academia.
drop index if exists inscripciones_cliente_academia_key;
alter table public.inscripciones drop constraint if exists inscripciones_cliente_id_academia_id_key;
create unique index if not exists inscripciones_miembro_academia_idx
  on public.inscripciones (miembro_id, academia_id) where activa;
