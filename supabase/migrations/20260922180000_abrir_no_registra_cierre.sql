-- `clases.registrada_por` es quién registró el CIERRE, no quién creó la clase
-- (22-sep-2026). Lo escribe `cerrarClase` y lo borra `reabrirCierre`; el nombre
-- de la columna engaña. `clase_abrir_del_planeador` lo estaba poniendo al CREAR,
-- así que una clase apenas abierta habría dicho que alguien ya la había cerrado.

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

  -- OJO: sin `registrada_por`. La clase queda `programada` y esa columna la
  -- llena `cerrarClase` cuando de verdad se cierre.
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

comment on column public.clases.registrada_por is
  'Quién registró el CIERRE de la clase (no quién la creó). Se llena al cerrar y se borra al reabrir.';

commit;
