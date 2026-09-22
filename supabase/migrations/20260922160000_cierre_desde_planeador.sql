-- El cierre sale del planeador (22-sep-2026)
--
-- La programación de las academias es la MISMA todas las semanas, así que no hay
-- que "generar" nada: `/cierre` le pregunta al planeador qué debió dictarse y lo
-- lista. La fila de `clases` NACE CUANDO EL PROFESOR CIERRA.
--
-- Se descartó generar las 52 clases cada lunes: si nadie cierra se acumulan, en
-- festivos y vacaciones crea clases que nunca pasaron, y un mes sin cerrar deja
-- ~220 filas fantasma en la tabla de la que come la liquidación. Derivando no
-- hay nada que generar ni nada que limpiar.

begin;

-- ─────────────────────────────────────────────────────────────
-- 1 · Desde cuándo vale cada clase del planeador
-- ─────────────────────────────────────────────────────────────
-- Sin piso, la cola propondría clases hacia atrás hasta el infinito.
alter table public.clase_semanal
  add column if not exists vigente_desde date not null default current_date;

update public.clase_semanal set vigente_desde = '2026-10-01' where vigente_desde <> '2026-10-01';

comment on column public.clase_semanal.vigente_desde is
  'Desde qué fecha se le puede exigir esta clase. Las 52 del planeador arrancan el 1-oct-2026 (decisión de Laura: empezar el mes limpio).';

-- ─────────────────────────────────────────────────────────────
-- 2 · Recesos
-- ─────────────────────────────────────────────────────────────
-- Un FESTIVO y un RECESO no son lo mismo, y la diferencia la dictó el club:
--   · festivo  → la academia NO dicta. La cola ni lo propone (tabla `festivo`).
--   · receso   → SÍ hay clase, pero no todos van. Se propone igual —porque a los
--                que fueron hay que poder cerrarlos— y NO se reprocha si nadie
--                la cierra.
-- Esconder el receso dejaría sin registrar a los que sí fueron; tratarlo como
-- semana normal llenaría la cola de ~100 clases que nadie va a cerrar, y a la
-- tercera semana nadie le cree al aviso de "falta cerrar".
create table public.academia_receso (
  id         bigint generated always as identity primary key,
  desde      date not null,
  hasta      date not null,
  motivo     text not null,
  created_at timestamptz not null default now(),
  constraint academia_receso_rango check (hasta >= desde)
);
create index academia_receso_idx on public.academia_receso (desde, hasta);

alter table public.academia_receso enable row level security;
create policy academia_receso_select on public.academia_receso for select to authenticated
  using (private.user_role() = any (array['superadmin','coord_admin','coord_deportivo','recepcion','profesor']::public.app_role[]));
create policy academia_receso_write on public.academia_receso for all to authenticated
  using      (private.user_role() = any (array['superadmin','coord_admin','coord_deportivo']::public.app_role[]))
  with check (private.user_role() = any (array['superadmin','coord_admin','coord_deportivo']::public.app_role[]));

-- ─────────────────────────────────────────────────────────────
-- 3 · Una clase del planeador no se puede cerrar dos veces
-- ─────────────────────────────────────────────────────────────
-- Es lo que impide que el cierre derivado y el registro desde /clases (el bloqueo
-- de EasyCancha) creen la misma clase por duplicado. Parcial porque las clases de
-- agosto son del modelo viejo y no apuntan a ninguna celda.
create unique index clases_planeador_uidx
  on public.clases (clase_semanal_id, fecha)
  where clase_semanal_id is not null;

-- ─────────────────────────────────────────────────────────────
-- 4 · Qué debió dictarse y todavía no se ha cerrado
-- ─────────────────────────────────────────────────────────────
-- SECURITY INVOKER a propósito: así la RLS filtra sola y no hay un segundo
-- guardia escrito a mano que se pueda desactualizar (mismo criterio que
-- `turnos_horas`).
create or replace function public.academia_pendientes(
  p_desde date,
  p_hasta date,
  p_profesor uuid default null
)
returns table (
  clase_id bigint, profesor_id uuid, fecha date, hora_inicio time,
  duracion_min smallint, cancha text, ninos int, en_receso boolean
)
language sql stable set search_path to 'public' as $$
  select cs.id, cs.profesor_id, d::date, cs.hora_inicio, cs.duracion_min, cs.cancha,
         (select count(*)::int from inscripcion_clase x where x.clase_id = cs.id),
         exists (select 1 from academia_receso r where d::date between r.desde and r.hasta)
  from generate_series(p_desde, p_hasta, interval '1 day') d
  join clase_semanal cs
    on cs.activa
   and cs.dia_semana = extract(dow from d)::smallint
   and d::date >= cs.vigente_desde
  where not exists (select 1 from festivo f where f.fecha = d::date)
    and not exists (select 1 from clases c where c.clase_semanal_id = cs.id and c.fecha = d::date)
    and (p_profesor is null or cs.profesor_id = p_profesor)
  order by d, cs.hora_inicio;
$$;

comment on function public.academia_pendientes is
  'Las clases que el planeador dice que debieron dictarse y que nadie ha cerrado. Los festivos se saltan (el club no dicta); los recesos salen marcados, porque algunos niños sí van.';

-- ─────────────────────────────────────────────────────────────
-- 5 · Abrir la clase para cerrarla
-- ─────────────────────────────────────────────────────────────
-- SECURITY DEFINER porque `clases_write` NO cubre al profesor, y el profesor es
-- justo quien más cierra. Sin esto, su inserción la rechazaría la RLS **sin
-- lanzar error** y la clase no se crearía en silencio — el fallo que este
-- proyecto ya pagó con el saldo de los paquetes.
create or replace function public.clase_abrir_del_planeador(
  p_clase_semanal bigint,
  p_fecha date
)
returns bigint
language plpgsql security definer set search_path to 'public' as $$
declare
  cs   public.clase_semanal%rowtype;
  v_id bigint;
begin
  select * into cs from public.clase_semanal where id = p_clase_semanal and activa;
  if not found then
    raise exception 'Esa clase ya no está en el planeador.' using errcode = 'no_data_found';
  end if;

  -- Mismo criterio que cerrar: coordinación/recepción, o el profesor de la clase.
  if not (
    private.user_role() = any (array['superadmin','coord_admin','coord_deportivo','recepcion']::public.app_role[])
    or cs.profesor_id = auth.uid()
  ) then
    raise exception 'No tienes permiso para registrar esta clase.' using errcode = 'insufficient_privilege';
  end if;

  if extract(dow from p_fecha)::smallint <> cs.dia_semana then
    raise exception 'Esa clase no se dicta ese día de la semana.' using errcode = 'check_violation';
  end if;
  if p_fecha < cs.vigente_desde then
    raise exception 'El planeador todavía no aplicaba esa fecha.' using errcode = 'check_violation';
  end if;
  if p_fecha > current_date then
    raise exception 'Esa clase todavía no ha pasado.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.festivo f where f.fecha = p_fecha) then
    raise exception 'Ese día es festivo y la academia no dicta.' using errcode = 'check_violation';
  end if;

  -- Idempotente: si ya existe (la registraron desde /clases, o dos personas
  -- pulsaron a la vez), se devuelve la que hay en vez de crear otra.
  select id into v_id from public.clases
   where clase_semanal_id = p_clase_semanal and fecha = p_fecha;
  if found then return v_id; end if;

  insert into public.clases (
    tipo, clase_semanal_id, profesor_id, deporte, cancha, fecha,
    hora_inicio, hora_fin, precio, estado, registrada_por
  ) values (
    'academia', cs.id, cs.profesor_id, cs.deporte, cs.cancha, p_fecha,
    cs.hora_inicio, cs.hora_inicio + (cs.duracion_min || ' minutes')::interval,
    0, 'programada', auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.clase_abrir_del_planeador(bigint, date) from public;
grant execute on function public.clase_abrir_del_planeador(bigint, date) to authenticated;

commit;
