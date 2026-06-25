-- ============================================================================
-- 0020 · F2 — Módulo de eventos (torneos / clínicas / masterclass)
-- ----------------------------------------------------------------------------
-- Antes las masterclass/clínicas se registraban como `clases`, inflando horas y
-- conteo de los profesores. Ahora tienen tablas propias. Ingresos por la bolsa
-- de pagos (cada evento referencia un servicio). Profesores entran a Liquidación.
-- ============================================================================

create table public.eventos (
  id                 bigint generated always as identity primary key,
  nombre             text not null,
  tipo               text not null default 'otro',      -- 'torneo'|'clinica'|'masterclass'|'otro'
  deporte            public.deporte,
  servicio_id        bigint references public.servicios (id),
  fecha_inicio       date not null,
  fecha_fin          date,
  hora_inicio        time,
  lugar              text,
  cupo               int,
  precio_inscripcion integer not null default 0 check (precio_inscripcion >= 0),
  estado             text not null default 'planeado',  -- 'planeado'|'en_curso'|'finalizado'|'cancelado'
  notas              text,
  created_at         timestamptz not null default now()
);
create index eventos_fecha_idx on public.eventos (fecha_inicio);

create table public.evento_participantes (
  id              bigint generated always as identity primary key,
  evento_id       bigint not null references public.eventos (id) on delete cascade,
  cliente_id      bigint references public.clientes (id) on delete set null,
  nombre_externo  text,
  telefono_externo text,
  email_externo   text,
  monto           integer not null default 0 check (monto >= 0),
  pago_id         bigint references public.pagos (id) on delete set null,
  estado          text not null default 'inscrito',     -- 'inscrito'|'pagado'|'cancelado'
  created_at      timestamptz not null default now(),
  check (cliente_id is not null or nombre_externo is not null)
);
create index evento_participantes_evento_idx on public.evento_participantes (evento_id);

create table public.evento_profesores (
  id          bigint generated always as identity primary key,
  evento_id   bigint not null references public.eventos (id) on delete cascade,
  profesor_id uuid not null references public.profiles (id) on delete cascade,
  rol         text,
  pago        integer not null default 0 check (pago >= 0),  -- monto a liquidar al profe
  created_at  timestamptz not null default now()
);
create index evento_profesores_evento_idx on public.evento_profesores (evento_id);
create index evento_profesores_profesor_idx on public.evento_profesores (profesor_id);

-- ─────────────────────────── Grants + RLS ───────────────────────────
grant select, insert, update, delete on public.eventos to authenticated;
grant select, insert, update, delete on public.evento_participantes to authenticated;
grant select, insert, update, delete on public.evento_profesores to authenticated;
alter table public.eventos enable row level security;
alter table public.evento_participantes enable row level security;
alter table public.evento_profesores enable row level security;

-- Leer: todo el staff. Escribir: SA/CA (los eventos cobran → bolsa de pagos SA/CA).
create policy "eventos_select" on public.eventos for select to authenticated
  using (private.user_role() in ('superadmin','coord_admin','coord_deportivo','recepcion','profesor'));
create policy "eventos_write" on public.eventos for all to authenticated
  using (private.user_role() in ('superadmin','coord_admin'))
  with check (private.user_role() in ('superadmin','coord_admin'));

create policy "evento_part_select" on public.evento_participantes for select to authenticated
  using (private.user_role() in ('superadmin','coord_admin','coord_deportivo','recepcion','profesor'));
create policy "evento_part_write" on public.evento_participantes for all to authenticated
  using (private.user_role() in ('superadmin','coord_admin'))
  with check (private.user_role() in ('superadmin','coord_admin'));

create policy "evento_prof_select" on public.evento_profesores for select to authenticated
  using (private.user_role() in ('superadmin','coord_admin','coord_deportivo','recepcion','profesor'));
create policy "evento_prof_write" on public.evento_profesores for all to authenticated
  using (private.user_role() in ('superadmin','coord_admin'))
  with check (private.user_role() in ('superadmin','coord_admin'));
