-- Clases de COLEGIO en el planeador (24-sep-2026, academias de pádel)
--
-- El club dicta pádel al colegio Montessori (martes 3 p. m. con Juan Cruz). Es
-- academia —el profesor la cierra y cuenta para su pago— pero NO lleva niños
-- inscritos: al cerrarla solo se dice si se dictó o no. Laura: "Montessori no
-- tiene niños asociados; debe aparecer como la clase y decir si se dictó o no".
--
-- `colegio` es el nombre que se muestra en lugar del conteo de niños. Con él
-- puesto la clase no admite inscripciones (lo cuida la acción y un trigger).

begin;

alter table public.clase_semanal
  add column colegio text check (colegio is null or btrim(colegio) <> '');

comment on column public.clase_semanal.colegio is
  'Si la clase es para un colegio (p. ej. Montessori): su nombre. No lleva niños inscritos; se cierra solo diciendo si se dictó.';

-- Una clase de colegio no lleva lista: rechazar inscripciones en ella.
create or replace function private.clase_colegio_sin_ninos()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if exists (select 1 from public.clase_semanal cs where cs.id = new.clase_id and cs.colegio is not null) then
    raise exception 'Esa es una clase de colegio: no lleva niños inscritos.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger inscripcion_clase_no_colegio
  before insert or update on public.inscripcion_clase
  for each row execute function private.clase_colegio_sin_ninos();

-- El planeador y la cola de cierre devuelven el colegio. Cambia la salida → DROP + CREATE.
drop function if exists public.planeador_semana(public.deporte);
create function public.planeador_semana(p_deporte public.deporte default 'tenis')
returns table (
  clase_id bigint, profesor_id uuid, dia_semana smallint, hora_inicio time,
  duracion_min smallint, cancha text, ninos int, recreativa int, competencia int,
  colegio text
)
language sql stable set search_path to 'public' as $$
  select cs.id, cs.profesor_id, cs.dia_semana, cs.hora_inicio, cs.duracion_min, cs.cancha,
         count(x.id)::int,
         count(*) filter (where a.categoria = 'recreativa')::int,
         count(*) filter (where a.categoria = 'competencia')::int,
         cs.colegio
  from clase_semanal cs
  left join inscripcion_clase x on x.clase_id = cs.id
  left join inscripciones i on i.id = x.inscripcion_id and i.activa
  left join academias a on a.id = i.academia_id
  where cs.activa and cs.deporte = p_deporte
  group by cs.id
  order by cs.dia_semana, cs.hora_inicio;
$$;
grant execute on function public.planeador_semana(public.deporte) to authenticated;

drop function if exists public.academia_pendientes(date, date, uuid);
create function public.academia_pendientes(
  p_desde date,
  p_hasta date,
  p_profesor uuid default null
)
returns table (
  clase_id bigint, profesor_id uuid, fecha date, hora_inicio time,
  duracion_min smallint, cancha text, ninos int, deporte public.deporte, colegio text
)
language sql stable set search_path to 'public' as $$
  select cs.id, cs.profesor_id, d::date, cs.hora_inicio, cs.duracion_min, cs.cancha,
         (select count(*)::int from inscripcion_clase x where x.clase_id = cs.id),
         cs.deporte, cs.colegio
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
grant execute on function public.academia_pendientes(date, date, uuid) to authenticated;

comment on function public.academia_pendientes is
  'Las clases que el planeador dice que debieron dictarse y que nadie ha cerrado. Se saltan festivos y los días de una pausa de academias.';

commit;
