-- ============================================================================
-- 0006 · Sprint 2 — Servicios y clases (M4 academias, M5 paquetes, M6 clases)
-- ============================================================================

create type public.deporte as enum ('tenis', 'padel');
create type public.clase_tipo as enum ('academia', 'individual');
create type public.clase_estado as enum ('programada', 'realizada', 'cancelada', 'no_show');
create type public.paquete_estado as enum ('activo', 'agotado', 'vencido');

-- ─────────────────────────── Academias (M4) ───────────────────────────
create table public.academias (
  id             bigint generated always as identity primary key,
  codigo         text unique not null,
  nombre         text not null,
  deporte        public.deporte not null,
  nivel          text,
  profesor_id    uuid references public.profiles (id) on delete set null,
  cancha         text,
  horario        text,
  precio         integer not null default 0 check (precio >= 0),
  matricula      integer not null default 0 check (matricula >= 0),
  periodo_inicio date,
  periodo_fin    date,
  activa         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger academias_set_updated_at before update on public.academias
  for each row execute function private.set_updated_at();

-- Inscripción cliente ↔ academia (plan de frecuencia + descuento por servicio)
create table public.inscripciones (
  id                bigint generated always as identity primary key,
  academia_id       bigint not null references public.academias (id) on delete cascade,
  cliente_id        bigint not null references public.clientes (id) on delete cascade,
  plan_frecuencia   smallint not null check (plan_frecuencia in (1, 2, 3)),
  descuento_pct     numeric(5, 2) not null default 0 check (descuento_pct between 0 and 100),
  fecha_inscripcion date not null default current_date,
  activa            boolean not null default true,
  created_at        timestamptz not null default now(),
  unique (academia_id, cliente_id)
);

-- Lista de espera (interesados; pueden no ser clientes aún)
create table public.lista_espera (
  id             bigint generated always as identity primary key,
  academia_id    bigint references public.academias (id) on delete set null,
  cliente_id     bigint references public.clientes (id) on delete set null,
  nombre         text not null,
  contacto       text,
  deporte        public.deporte,
  nivel          text,
  edad           smallint,
  disponibilidad text,
  created_at     timestamptz not null default now()
);

-- ─────────────────────────── Paquetes (M5) ───────────────────────────
create table public.paquetes_catalogo (
  id         bigint generated always as identity primary key,
  nombre     text not null,
  deporte    public.deporte,
  num_clases smallint not null check (num_clases > 0),
  precio     integer not null default 0 check (precio >= 0),
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.paquetes_cliente (
  id                bigint generated always as identity primary key,
  cliente_id        bigint not null references public.clientes (id) on delete cascade,
  catalogo_id       bigint references public.paquetes_catalogo (id) on delete set null,
  num_clases        smallint not null check (num_clases > 0),
  clases_consumidas smallint not null default 0 check (clases_consumidas >= 0),
  descuento_pct     numeric(5, 2) not null default 0 check (descuento_pct between 0 and 100),
  estado            public.paquete_estado not null default 'activo',
  vence_el          date,
  created_at        timestamptz not null default now()
);
create index paquetes_cliente_cliente_idx on public.paquetes_cliente (cliente_id);

-- ─────────────────────────── Clases (M6, usadas también por M7) ───────────────────────────
create table public.clases (
  id                 bigint generated always as identity primary key,
  tipo               public.clase_tipo not null,
  academia_id        bigint references public.academias (id) on delete cascade,
  cliente_id         bigint references public.clientes (id) on delete set null,
  paquete_cliente_id bigint references public.paquetes_cliente (id) on delete set null,
  profesor_id        uuid references public.profiles (id) on delete set null,
  deporte            public.deporte,
  nivel              text,
  cancha             text,
  fecha              date not null,
  hora_inicio        time,
  hora_fin           time,
  precio             integer default 0 check (precio >= 0),
  descuento_pct      numeric(5, 2) not null default 0 check (descuento_pct between 0 and 100),
  estado             public.clase_estado not null default 'programada',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index clases_fecha_idx on public.clases (fecha);
create index clases_profesor_idx on public.clases (profesor_id, fecha);
create index clases_academia_idx on public.clases (academia_id);
create trigger clases_set_updated_at before update on public.clases
  for each row execute function private.set_updated_at();

-- ─────────────────────────── Grants + RLS ───────────────────────────
grant select, insert, update, delete on public.academias to authenticated;
grant select, insert, update, delete on public.inscripciones to authenticated;
grant select, insert, update, delete on public.lista_espera to authenticated;
grant select, insert, update, delete on public.paquetes_catalogo to authenticated;
grant select, insert, update, delete on public.paquetes_cliente to authenticated;
grant select, insert, update, delete on public.clases to authenticated;

alter table public.academias enable row level security;
alter table public.inscripciones enable row level security;
alter table public.lista_espera enable row level security;
alter table public.paquetes_catalogo enable row level security;
alter table public.paquetes_cliente enable row level security;
alter table public.clases enable row level security;

-- Helper inline de roles vía private.user_role(); patrón: SELECT amplio + ALL para escritura.

-- academias: leer todo el staff; escribir SA/CA/CD
create policy "academias_select" on public.academias for select to authenticated
  using (private.user_role() in ('superadmin','coord_admin','coord_deportivo','recepcion','profesor'));
create policy "academias_write" on public.academias for all to authenticated
  using (private.user_role() in ('superadmin','coord_admin','coord_deportivo'))
  with check (private.user_role() in ('superadmin','coord_admin','coord_deportivo'));

-- inscripciones: leer staff; escribir SA/CA/CD/RC (recepción inscribe)
create policy "inscripciones_select" on public.inscripciones for select to authenticated
  using (private.user_role() in ('superadmin','coord_admin','coord_deportivo','recepcion','profesor'));
create policy "inscripciones_write" on public.inscripciones for all to authenticated
  using (private.user_role() in ('superadmin','coord_admin','coord_deportivo','recepcion'))
  with check (private.user_role() in ('superadmin','coord_admin','coord_deportivo','recepcion'));

-- lista_espera: leer/escribir SA/CA/CD/RC
create policy "lista_espera_select" on public.lista_espera for select to authenticated
  using (private.user_role() in ('superadmin','coord_admin','coord_deportivo','recepcion'));
create policy "lista_espera_write" on public.lista_espera for all to authenticated
  using (private.user_role() in ('superadmin','coord_admin','coord_deportivo','recepcion'))
  with check (private.user_role() in ('superadmin','coord_admin','coord_deportivo','recepcion'));

-- paquetes_catalogo: leer staff; escribir SA/CA
create policy "paq_cat_select" on public.paquetes_catalogo for select to authenticated
  using (private.user_role() in ('superadmin','coord_admin','coord_deportivo','recepcion','profesor'));
create policy "paq_cat_write" on public.paquetes_catalogo for all to authenticated
  using (private.user_role() in ('superadmin','coord_admin'))
  with check (private.user_role() in ('superadmin','coord_admin'));

-- paquetes_cliente: leer staff; escribir SA/CA/RC
create policy "paq_cli_select" on public.paquetes_cliente for select to authenticated
  using (private.user_role() in ('superadmin','coord_admin','coord_deportivo','recepcion','profesor'));
create policy "paq_cli_write" on public.paquetes_cliente for all to authenticated
  using (private.user_role() in ('superadmin','coord_admin','recepcion'))
  with check (private.user_role() in ('superadmin','coord_admin','recepcion'));

-- clases: leer staff; escribir SA/CA/CD/RC (profesor solo lee aquí; cierra en M7)
create policy "clases_select" on public.clases for select to authenticated
  using (private.user_role() in ('superadmin','coord_admin','coord_deportivo','recepcion','profesor'));
create policy "clases_write" on public.clases for all to authenticated
  using (private.user_role() in ('superadmin','coord_admin','coord_deportivo','recepcion'))
  with check (private.user_role() in ('superadmin','coord_admin','coord_deportivo','recepcion'));
