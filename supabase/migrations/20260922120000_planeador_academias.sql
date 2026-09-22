-- Academias: el planeador manda (22-sep-2026)
--
-- El club nos pasó su Excel "PLANEADOR BASE" y ahí no existe ni una sola de las
-- tres cosas sobre las que estaba montado el modelo viejo: no hay nombre de
-- grupo (Dumbo, Mulán, Federer), no hay nivel y no hay cupo. Lo único que
-- identifica una clase es QUIÉN la dicta, QUÉ DÍA, A QUÉ HORA y CUÁNTO DURA.
--
-- Y el hallazgo que obliga el cambio: "Recreativa/Competencia" es un atributo
-- del NIÑO, no de la clase. Medido en el Excel — el lunes 17:30 de Graciano es
-- UNA celda con 4 niños, de los cuales Samuel Echeverry es de competencia y los
-- otros tres de recreativa. Se repite el miércoles. Por eso `clase_semanal` NO
-- cuelga de `academias`: cuelga del PROFESOR. La academia vive en la
-- inscripción del niño, que es donde se decide a quién se le cobra qué.
--
-- Se van `academia_grupo` (nombre + nivel + rango de edad) y `grupo_franja`.
-- El cupo se va entero (decisión de Laura, 22-sep-2026): no hay tope, solo se
-- muestra cuántos van.

begin;

-- ─────────────────────────────────────────────────────────────
-- 1 · La clase semanal: una celda del planeador
-- ─────────────────────────────────────────────────────────────
create table public.clase_semanal (
  id            bigint generated always as identity primary key,
  profesor_id   uuid not null references public.profiles(id),
  deporte       public.deporte not null default 'tenis',
  dia_semana    smallint not null check (dia_semana between 0 and 6),
  hora_inicio   time not null,
  duracion_min  smallint not null check (duracion_min between 15 and 300),
  cancha        text,
  activa        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- La llave NO incluye la duración a propósito. En el Excel, Krystal García hace
-- 60 min dentro de la clase de 90 de Graciano (lun y vie 16:00): si la duración
-- entrara en la llave, esa clase se partiría en dos y el planeador mostraría
-- una clase fantasma. Un profesor no puede estar en dos canchas a la vez, así
-- que día + hora ya identifican su clase.
create unique index clase_semanal_uidx
  on public.clase_semanal (profesor_id, dia_semana, hora_inicio)
  where activa;

create index clase_semanal_dia_idx on public.clase_semanal (dia_semana, hora_inicio) where activa;

create or replace function public.clase_semanal_touch() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;
create trigger clase_semanal_touch before update on public.clase_semanal
  for each row execute function public.clase_semanal_touch();

comment on table public.clase_semanal is
  'Una celda del planeador del club: profesor + día + hora + duración. NO pertenece a una academia — recreativa/competencia es del niño (ver inscripciones).';

-- ─────────────────────────────────────────────────────────────
-- 2 · Qué niño va a qué clase
-- ─────────────────────────────────────────────────────────────
create table public.inscripcion_clase (
  id             bigint generated always as identity primary key,
  inscripcion_id bigint not null references public.inscripciones(id) on delete cascade,
  clase_id       bigint not null references public.clase_semanal(id) on delete cascade,
  desde          date not null default current_date,
  created_at     timestamptz not null default now(),
  unique (inscripcion_id, clase_id)
);
create index inscripcion_clase_clase_idx on public.inscripcion_clase (clase_id);

-- ─────────────────────────────────────────────────────────────
-- 3 · La inscripción: el niño en Recreativa o Competencia
-- ─────────────────────────────────────────────────────────────
-- Retirar deja de ser un DELETE. Con asistencia de por medio, borrar la
-- inscripción borra la prueba de lo que se dictó y se cobró.
alter table public.inscripciones add column if not exists retirada_el date;
alter table public.inscripciones drop column if exists grupo_id;

comment on column public.inscripciones.retirada_el is
  'Cuándo se retiró de la academia. Se apaga `activa` y se sella la fecha; no se borra, porque la asistencia pasada tiene que poder explicarse.';

-- ─────────────────────────────────────────────────────────────
-- 4 · La clase registrada apunta a su clase del planeador
-- ─────────────────────────────────────────────────────────────
alter table public.clases drop column if exists grupo_id;
alter table public.clases add column if not exists clase_semanal_id bigint
  references public.clase_semanal(id) on delete set null;
create index if not exists clases_semanal_idx on public.clases (clase_semanal_id);

comment on column public.clases.clase_semanal_id is
  'De qué celda del planeador salió esta clase. Con esto el roster de /cierre es exacto: no hay que adivinar por día+hora.';

-- ─────────────────────────────────────────────────────────────
-- 5 · Se va el modelo viejo
-- ─────────────────────────────────────────────────────────────
drop function if exists public.academia_grupos_resumen(bigint);
drop function if exists public.grupo_franjas(bigint);
drop function if exists public.grupo_inscritos_por_franja(bigint, date, date);
drop function if exists public.academia_ocupacion_franja(bigint, date, date);
drop function if exists public.franja_cupo(bigint);

drop table if exists public.inscripcion_franja;
drop table if exists public.grupo_franja;
drop table if exists public.academia_grupo;

drop function if exists public.cupo_nivel(public.academia_nivel);
drop function if exists public.grupo_nivel_valido();
drop type if exists public.academia_nivel;

-- ─────────────────────────────────────────────────────────────
-- 6 · Permisos (mismo patrón que inscripciones — regla 9: `private.user_role()`)
-- ─────────────────────────────────────────────────────────────
alter table public.clase_semanal enable row level security;
alter table public.inscripcion_clase enable row level security;

create policy clase_semanal_select on public.clase_semanal for select to authenticated
  using (private.user_role() = any (array['superadmin','coord_admin','coord_deportivo','recepcion','profesor']::public.app_role[]));
create policy clase_semanal_write on public.clase_semanal for all to authenticated
  using      (private.user_role() = any (array['superadmin','coord_admin','coord_deportivo']::public.app_role[]))
  with check (private.user_role() = any (array['superadmin','coord_admin','coord_deportivo']::public.app_role[]));

create policy inscripcion_clase_select on public.inscripcion_clase for select to authenticated
  using (private.user_role() = any (array['superadmin','coord_admin','coord_deportivo','recepcion','profesor']::public.app_role[]));
create policy inscripcion_clase_write on public.inscripcion_clase for all to authenticated
  using      (private.user_role() = any (array['superadmin','coord_admin','coord_deportivo','recepcion']::public.app_role[]))
  with check (private.user_role() = any (array['superadmin','coord_admin','coord_deportivo','recepcion']::public.app_role[]));

commit;
