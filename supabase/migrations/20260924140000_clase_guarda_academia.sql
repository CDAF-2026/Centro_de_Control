-- La clase abierta desde el planeador guarda SU ACADEMIA cuando es una sola
-- (24-sep-2026, reglas de pago de pádel).
--
-- Laura: Leo cobra $90.000 por clase de academia RECREATIVA y el 50% de lo
-- facturado en COMPETENCIA. Su clase de competencia (lun y mié 5–6:30) no
-- puede pagar además los $90.000. Hasta hoy la regla de academia no sabía de
-- qué academia era la clase: `clases.academia_id` quedaba en null para todo lo
-- que salía del planeador. Ahora se llena si los niños de la clase son todos de
-- la misma academia, y la regla puede atarse a una (profesor_regla.servicio_id
-- con concepto academia; ver liquidacion.ts).
--
-- Se congela al ABRIR la clase, no se recalcula: mover un niño después no debe
-- cambiar cómo se pagó una clase que ya pasó.

begin;

create or replace function public.clase_abrir_del_planeador(
  p_clase_semanal bigint,
  p_fecha date
)
returns bigint
language plpgsql security definer set search_path to 'public' as $$
declare
  cs   public.clase_semanal%rowtype;
  v_id bigint;
  v_aca bigint;
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

  -- La academia de la clase, CONGELADA al abrirla: si todos los niños apuntados
  -- son de la misma academia (la de competencia de Leo), esa; si se mezclan
  -- (el lunes 17:30 de Graciano) o no hay niños (Montessori), null. La
  -- liquidación la usa para las reglas de pago atadas a una academia.
  select case when count(distinct i.academia_id) = 1 then min(i.academia_id) end
    into v_aca
    from public.inscripcion_clase x
    join public.inscripciones i on i.id = x.inscripcion_id and i.activa
   where x.clase_id = cs.id;

  insert into public.clases (
    tipo, clase_semanal_id, academia_id, profesor_id, deporte, cancha, fecha,
    hora_inicio, hora_fin, precio, estado
  ) values (
    'academia', cs.id, v_aca, cs.profesor_id, cs.deporte, cs.cancha, p_fecha,
    cs.hora_inicio, cs.hora_inicio + (cs.duracion_min || ' minutes')::interval,
    0, 'programada'
  )
  returning id into v_id;
  return v_id;
end;
$$;

commit;
