-- ============================================================================
-- 0015 · Liquidación — modelo de compensación del profesor + valores
-- ============================================================================

-- Tipo de compensación del profesor.
create type public.compensacion_tipo as enum ('por_clase', 'fijo_comision', 'fisico');

-- Configuración de pago por profesor (una fila por profesor).
--   por_clase     → % por clase (particular/paquete): pct_clase
--   fijo_comision → salario fijo por quincena + % comisión por clase: salario_fijo + pct_clase
--   fisico        → pago por asistente + comisión quincenal: pago_asistencia + comision_quincenal
-- Academias se liquidan aparte: nº alumnos presentes × academias.valor_alumno.
create table public.profesor_compensacion (
  profesor_id        uuid primary key references public.profiles (id) on delete cascade,
  tipo               public.compensacion_tipo not null default 'por_clase',
  pct_clase          numeric(5, 2) not null default 0 check (pct_clase between 0 and 100),
  salario_fijo       integer not null default 0 check (salario_fijo >= 0),
  pago_asistencia    integer not null default 0 check (pago_asistencia >= 0),
  comision_quincenal integer not null default 0 check (comision_quincenal >= 0),
  updated_at         timestamptz not null default now()
);
create trigger profesor_compensacion_set_updated_at before update on public.profesor_compensacion
  for each row execute function private.set_updated_at();

-- Valor que el profesor gana por cada alumno presente en una academia.
alter table public.academias
  add column valor_alumno integer not null default 0 check (valor_alumno >= 0);

-- Valor facturado de la clase, "congelado" al cierre (base del % en particular/paquete).
alter table public.clases
  add column valor_facturado integer;

-- ─────────────────────────── Grants + RLS ───────────────────────────
grant select, insert, update, delete on public.profesor_compensacion to authenticated;
alter table public.profesor_compensacion enable row level security;

-- Leer: SA/CA/CD (gestión y liquidación). Escribir: SA/CA.
create policy "prof_comp_select" on public.profesor_compensacion for select to authenticated
  using (private.user_role() in ('superadmin', 'coord_admin', 'coord_deportivo'));
create policy "prof_comp_write" on public.profesor_compensacion for all to authenticated
  using (private.user_role() in ('superadmin', 'coord_admin'))
  with check (private.user_role() in ('superadmin', 'coord_admin'));
