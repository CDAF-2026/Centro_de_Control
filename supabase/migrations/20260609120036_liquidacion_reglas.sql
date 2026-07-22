-- ============================================================================
-- 0036 · Liquidación — reglas de compensación por entrenador (modelo flexible)
-- ============================================================================
-- Reemplaza el modelo de "3 moldes fijos" (profesor_compensacion) por una LISTA
-- de reglas por entrenador: cada regla dice "para este tipo de trabajo, págale
-- así". Convivencia: si un profesor tiene reglas, la liquidación las usa; si no,
-- sigue con profesor_compensacion (los profes no migrados quedan intactos).
--
--   concepto → a qué trabajo aplica la regla:
--     clase_particular · paquete · academia (clases de la app) · siigo (grupo Siigo)
--   metodo → cómo se calcula el pago:
--     pct_facturado         → pct % del valor cobrado en la clase
--     fijo_por_clase        → valor plano por clase realizada
--     escalonado_asistentes → valor según nº de asistentes (escalones jsonb)
--     por_alumno            → asistentes presentes × valor
--     pct_siigo_servicio    → pct % de lo facturado en Siigo del servicio (periodo)

create table public.profesor_regla (
  id          bigint generated always as identity primary key,
  profesor_id uuid not null references public.profiles (id) on delete cascade,
  nombre      text not null,                       -- etiqueta visible ("Academia Recreativa Pádel")
  concepto    text not null check (concepto in ('clase_particular', 'paquete', 'academia', 'siigo')),
  metodo      text not null check (metodo in (
                'pct_facturado', 'fijo_por_clase', 'escalonado_asistentes', 'por_alumno', 'pct_siigo_servicio')),
  pct         numeric(5, 2) not null default 0 check (pct between 0 and 100),
  valor       integer not null default 0 check (valor >= 0),
  servicio_id integer references public.servicios (id) on delete set null,  -- solo pct_siigo_servicio
  escalones   jsonb,                               -- solo escalonado_asistentes: [{"min":1,"valor":35000},...]
  orden       integer not null default 0,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index profesor_regla_profesor_idx on public.profesor_regla (profesor_id);
create trigger profesor_regla_set_updated_at before update on public.profesor_regla
  for each row execute function private.set_updated_at();

-- ─────────────────────────── Grants + RLS ───────────────────────────
grant select, insert, update, delete on public.profesor_regla to authenticated;
alter table public.profesor_regla enable row level security;

-- Leer: SA/CA/CD (gestión y liquidación). Escribir: SA/CA. (igual que profesor_compensacion)
create policy "prof_regla_select" on public.profesor_regla for select to authenticated
  using (private.user_role() in ('superadmin', 'coord_admin', 'coord_deportivo'));
create policy "prof_regla_write" on public.profesor_regla for all to authenticated
  using (private.user_role() in ('superadmin', 'coord_admin'))
  with check (private.user_role() in ('superadmin', 'coord_admin'));

-- ─────────────── Nº de personas en la clase particular (Cristian) ───────────────
-- Se captura al cerrar una clase particular; define el escalón de precio.
-- null = clase de una persona (comportamiento por defecto).
alter table public.clases
  add column num_asistentes integer check (num_asistentes is null or num_asistentes >= 1);
comment on column public.clases.num_asistentes is
  'Nº de personas en una clase particular (define el escalón de precio en la liquidación). Se captura al cerrar.';

-- ─────────────── Servicio Siigo: Academia Alto Rendimiento Pádel ───────────────
-- El grupo aún no existe en Siigo (se va a crear). Mientras tanto suma $0 sin error.
-- siigo_grupo debe coincidir EXACTO con el account_group de Siigo cuando se cree
-- (Siigo suele venir sin tildes: "Academia de Padel", "Alto rendimiento Joaquin").
insert into public.servicios (clave, nombre, color, categoria_saldo, siigo_grupo, activo, orden)
values ('alto_rendimiento_padel', 'Academia Alto Rendimiento Pádel', '#5e35b1', 'academia', 'Academia Alto Rendimiento Padel', true, 25)
on conflict (clave) do nothing;
