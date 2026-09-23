-- Pausar academias (23-sep-2026, idea de los dueños del club)
--
-- Reemplaza al receso por fechas. En vez de cargar de antemano "del 15-dic al
-- 7-ene", el club oprime "Pausar academias" el día que salen a vacaciones y
-- "Reactivar" el día que vuelven. Mientras tanto no se piden cierres de academia.
--
-- ⚠️ Por dentro NO es un interruptor encendido/apagado: guarda FECHAS. Si fuera
-- solo un booleano consultado al vuelo, (a) al pausar se esconderían también las
-- clases de ANTES de la pausa que nadie cerró, y (b) al reactivar volverían a
-- aparecer como pendientes TODAS las clases de las vacaciones (medido: 177 entre
-- el 15-dic y el 7-ene). Con fechas, cada pausa tapa exactamente sus días.
--
-- A diferencia del receso, durante la pausa la clase NI SE PROPONE (decisión
-- del club: "que sea el control"). Consecuencia aceptada: si un niño sí va en
-- vacaciones, no hay cómo registrarlo.

begin;

create table public.academia_pausa (
  id             bigint generated always as identity primary key,
  desde          date not null,
  hasta          date,                       -- null = sigue en pausa
  creada_por     uuid references public.profiles(id),
  reactivada_por uuid references public.profiles(id),
  created_at     timestamptz not null default now(),
  constraint academia_pausa_rango check (hasta is null or hasta >= desde)
);
-- Una sola pausa abierta a la vez.
create unique index academia_pausa_abierta_uidx on public.academia_pausa ((true)) where hasta is null;

comment on table public.academia_pausa is
  'Periodos en que las academias no dictan (vacaciones). hasta null = en pausa ahora. Guarda fechas y no un booleano para que pausar no esconda lo anterior y reactivar no resucite las vacaciones.';

alter table public.academia_pausa enable row level security;
create policy academia_pausa_select on public.academia_pausa for select to authenticated
  using (private.user_role() = any (array['superadmin','coord_admin','coord_deportivo','recepcion','profesor']::public.app_role[]));
create policy academia_pausa_write on public.academia_pausa for all to authenticated
  using      (private.user_role() = any (array['superadmin','coord_admin','coord_deportivo']::public.app_role[]))
  with check (private.user_role() = any (array['superadmin','coord_admin','coord_deportivo']::public.app_role[]));

-- El receso se va: nunca se cargó uno (0 filas) y la pausa hace su trabajo.
drop table if exists public.academia_receso;

-- La cola deja de proponer lo que cae en una pausa. Cambia la salida (se va
-- `en_receso`), así que DROP + CREATE.
drop function if exists public.academia_pendientes(date, date, uuid);
create function public.academia_pendientes(
  p_desde date,
  p_hasta date,
  p_profesor uuid default null
)
returns table (
  clase_id bigint, profesor_id uuid, fecha date, hora_inicio time,
  duracion_min smallint, cancha text, ninos int
)
language sql stable set search_path to 'public' as $$
  select cs.id, cs.profesor_id, d::date, cs.hora_inicio, cs.duracion_min, cs.cancha,
         (select count(*)::int from inscripcion_clase x where x.clase_id = cs.id)
  from generate_series(p_desde, p_hasta, interval '1 day') d
  join clase_semanal cs
    on cs.activa
   and cs.dia_semana = extract(dow from d)::smallint
   and d::date >= cs.vigente_desde
  where not exists (select 1 from festivo f where f.fecha = d::date)
    and not exists (select 1 from academia_pausa ap
                     where d::date >= ap.desde and (ap.hasta is null or d::date <= ap.hasta))
    and not exists (select 1 from clases c where c.clase_semanal_id = cs.id and c.fecha = d::date)
    and (p_profesor is null or cs.profesor_id = p_profesor)
  order by d, cs.hora_inicio;
$$;

comment on function public.academia_pendientes is
  'Las clases que el planeador dice que debieron dictarse y que nadie ha cerrado. Se saltan festivos y los días de una pausa de academias.';

-- Abrir una clase de un día en pausa tampoco se deja (mismo criterio que el festivo).
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
  if exists (select 1 from public.academia_pausa ap
              where p_fecha >= ap.desde and (ap.hasta is null or p_fecha <= ap.hasta)) then
    raise exception 'Ese día las academias estaban en pausa.' using errcode = 'check_violation';
  end if;

  select id into v_id from public.clases where clase_semanal_id = p_clase_semanal and fecha = p_fecha;
  if found then return v_id; end if;

  insert into public.clases (
    tipo, clase_semanal_id, profesor_id, deporte, cancha, fecha,
    hora_inicio, hora_fin, precio, estado
  ) values (
    'academia', cs.id, cs.profesor_id, cs.deporte, cs.cancha, p_fecha,
    cs.hora_inicio, cs.hora_inicio + (cs.duracion_min || ' minutes')::interval,
    0, 'programada'
  )
  returning id into v_id;
  return v_id;
end;
$$;

commit;
