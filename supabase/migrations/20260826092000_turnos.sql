-- ============================================================================
-- 0080 · Turnos del personal — tablas, fotos y marcación
-- ----------------------------------------------------------------------------
-- Registro de entrada y salida del personal por horas (Camila, Juan, Santiago y
-- Carlos). Dos puertas para marcar: el celular de cada quien y el PC de
-- recepción. Una sola implementación por dentro (`private.turno_marcar`), para
-- no repetir la lógica en dos sitios — en este proyecto una segunda copia de la
-- misma regla ya mordió dos veces (la normalización de nombres de EasyCancha y
-- el catálogo de roles).
--
-- 🔒 LA HORA LA PONE EL SERVIDOR, SIEMPRE.
-- La tabla NO tiene permiso de insert/update/delete para nadie: se escribe
-- únicamente por funciones SECURITY DEFINER que estampan `now()`. Si la hora
-- viniera en el formulario, bastaría con atrasarle el reloj al celular para
-- marcar entrada a las 6 a.m. Es lo mismo que se hizo con `evento_atar_facturas`
-- (una función estrecha en vez de abrir la tabla entera).
--
-- ⏱️ Todo se guarda en minutos redondos (sin segundos). Lo normaliza un trigger
-- y no un CHECK porque `date_trunc` sobre timestamptz es STABLE y Postgres no
-- acepta funciones no inmutables en un CHECK. El trigger además cubre cualquier
-- puerta futura (un script con service_role), que es donde este proyecto ya se
-- ha quemado antes.
-- ============================================================================

-- ─────────────────── 1 · Quién registra turnos ───────────────────
-- Va por PERSONA y no por rol a propósito: los cuatro que marcan son de roles
-- distintos (recepción, coord. administrativo y seguridad), y marcar turno no es
-- "ver un módulo" sino una condición del contrato. Mismo criterio con el que
-- `profesor_regla` decide a quién se le liquida, y no el rol.
alter table public.profiles add column if not exists marca_turno boolean not null default false;

comment on column public.profiles.marca_turno is
  'true = esta persona registra entrada y salida. Lo prende el superadministrador desde la ficha del empleado.';

-- Es una condición laboral, no una preferencia: si cualquiera pudiera apagárselo
-- desde "Mi perfil", desaparecería de la nómina por horas sin que nadie lo note.
-- Mismo candado que ya blinda `role` y `activo` (0060).
create or replace function private.profiles_blindar_rol()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and private.user_role() is distinct from 'superadmin' then
    if new.role is distinct from old.role then
      raise exception 'Solo el superadministrador puede cambiar el rol.';
    end if;
    if new.activo is distinct from old.activo then
      raise exception 'Solo el superadministrador puede activar o desactivar una cuenta.';
    end if;
    if new.marca_turno is distinct from old.marca_turno then
      raise exception 'Solo el superadministrador puede cambiar quién registra turnos.';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.profiles_blindar_rol() from public;

-- ─────────────────── 2 · El turno y sus pausas ───────────────────

create table public.turno (
  id               bigint generated always as identity primary key,
  perfil_id        uuid not null references public.profiles (id) on delete restrict,
  inicio_el        timestamptz not null,
  fin_el           timestamptz,
  foto_inicio_path text,
  foto_fin_path    text,
  origen           text not null default 'app' check (origen in ('app', 'quiosco', 'ajuste')),
  ajustado_por     uuid references public.profiles (id) on delete set null,
  ajuste_motivo    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint turno_orden check (fin_el is null or fin_el >= inicio_el)
);

comment on table public.turno is
  'Entrada y salida de un empleado. `fin_el` null = turno abierto (aporta CERO horas al reporte y sale en rojo).';
comment on column public.turno.origen is
  'app = marcó desde su celular · quiosco = desde el PC de recepción · ajuste = lo creó el superadministrador a mano.';

-- `on delete restrict` en perfil_id: el turno es prueba de nómina y no debe
-- borrarse al borrar una cuenta. De paso convierte en automática la verificación
-- que en julio hubo que hacer a mano —revisar 20 columnas— antes de borrar el
-- perfil duplicado de Willington.

-- Un solo turno abierto por persona. Es lo que hace que `private.turno_marcar`
-- pueda buscar "el turno abierto" sin ambigüedad.
create unique index turno_abierto_uidx on public.turno (perfil_id) where fin_el is null;
create index turno_perfil_inicio_idx on public.turno (perfil_id, inicio_el desc);
create index turno_inicio_idx on public.turno (inicio_el desc);

create table public.turno_pausa (
  id         bigint generated always as identity primary key,
  turno_id   bigint not null references public.turno (id) on delete cascade,
  inicio_el  timestamptz not null,
  fin_el     timestamptz,
  created_at timestamptz not null default now(),
  constraint turno_pausa_orden check (fin_el is null or fin_el >= inicio_el)
);

comment on table public.turno_pausa is
  'Almuerzo o descanso: NO es tiempo trabajado y se descuenta del turno. La jornada del club es de 7 h trabajadas más 1 de almuerzo.';

create unique index turno_pausa_abierta_uidx on public.turno_pausa (turno_id) where fin_el is null;
create index turno_pausa_turno_idx on public.turno_pausa (turno_id, inicio_el);

-- Minutos redondos, siempre y por cualquier puerta.
create or replace function private.turno_minutos_redondos()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.inicio_el := date_trunc('minute', new.inicio_el);
  new.fin_el    := date_trunc('minute', new.fin_el);
  return new;
end;
$$;
revoke all on function private.turno_minutos_redondos() from public;

create trigger turno_minutos_redondos
  before insert or update on public.turno
  for each row execute function private.turno_minutos_redondos();

create trigger turno_pausa_minutos_redondos
  before insert or update on public.turno_pausa
  for each row execute function private.turno_minutos_redondos();

create trigger turno_set_updated_at
  before update on public.turno
  for each row execute function private.set_updated_at();

-- ─────────────────── 3 · El PIN del quiósco ───────────────────
-- Tabla aparte y no una columna de `profiles` a propósito: la política
-- `profiles_select` deja al superadministrador leer la fila entera, y un PIN de
-- 4 dígitos son 10.000 combinaciones — un hash filtrado se revienta en
-- milisegundos. Aquí NO hay grants ni políticas: no lo lee NADIE. Solo entran
-- las funciones SECURITY DEFINER de más abajo.
create table public.turno_pin (
  perfil_id       uuid primary key references public.profiles (id) on delete cascade,
  pin_hash        text not null,
  intentos        int not null default 0,
  bloqueado_hasta timestamptz,
  updated_at      timestamptz not null default now()
);

comment on table public.turno_pin is
  'PIN de 4 dígitos para marcar en el PC de recepción. Hash bcrypt. Nadie puede leer esta tabla: solo las funciones del módulo.';

alter table public.turno_pin enable row level security;

create trigger turno_pin_set_updated_at
  before update on public.turno_pin
  for each row execute function private.set_updated_at();

-- ─────────────────── 4 · Quién ve los turnos ───────────────────
-- SOLO select. Nada de insert/update/delete: esa es la garantía de que la hora
-- no se puede falsear, porque no hay ninguna puerta que no pase por las
-- funciones de abajo.
grant select on public.turno to authenticated;
grant select on public.turno_pausa to authenticated;

alter table public.turno enable row level security;
alter table public.turno_pausa enable row level security;

-- Cada quien ve lo suyo; el reporte completo es solo del superadministrador
-- (decisión de Laura: ni siquiera el coordinador administrativo, que además es
-- uno de los que marca).
create policy "turno_select" on public.turno
  for select to authenticated
  using (perfil_id = (select auth.uid()) or private.user_role() = 'superadmin');

create policy "turno_pausa_select" on public.turno_pausa
  for select to authenticated
  using (exists (
    select 1 from public.turno t
     where t.id = turno_pausa.turno_id
       and (t.perfil_id = (select auth.uid()) or private.user_role() = 'superadmin')
  ));

-- ─────────────────── 5 · Las fotos ───────────────────
-- Bucket PRIVADO (a diferencia de `avatares`, que es público porque el avatar se
-- pinta en todas las pantallas): la foto de una cara es dato sensible según la
-- Ley 1581, así que se sirve con enlaces firmados y se borra al mes.
insert into storage.buckets (id, name, public)
values ('turnos', 'turnos', false)
on conflict (id) do nothing;

-- Subir: cada quien a su carpeta `<uid>/…`, y además la cuenta del quiósco, que
-- sube por cuenta de otro.
create policy "turnos_obj_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'turnos'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or private.user_role() in ('quiosco', 'superadmin')
    )
  );

-- Ver: la suya, o el superadministrador (que es quien revisa el reporte).
create policy "turnos_obj_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'turnos'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or private.user_role() = 'superadmin'
    )
  );

create policy "turnos_obj_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'turnos' and private.user_role() = 'superadmin');

-- ============================================================================
-- 6 · Marcar
-- ============================================================================

/**
 * Implementación única de las cuatro marcaciones. Las dos puertas públicas
 * (celular y quiósco) validan QUIÉN es y luego llaman aquí.
 *
 * p_accion: 'entrada' | 'salida' | 'pausa_inicio' | 'pausa_fin'
 */
create or replace function private.turno_marcar(
  p_perfil    uuid,
  p_accion    text,
  p_foto_path text,
  p_origen    text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ahora timestamptz := date_trunc('minute', now());
  v_turno bigint;
  v_pausa bigint;
begin
  -- A lo sumo uno: lo garantiza `turno_abierto_uidx`.
  select id into v_turno
    from public.turno
   where perfil_id = p_perfil and fin_el is null;

  if p_accion = 'entrada' then
    if v_turno is not null then
      raise exception 'Ya tienes un turno abierto. Ciérralo antes de iniciar otro.';
    end if;
    if p_foto_path is null then
      raise exception 'Falta la foto de entrada.';
    end if;
    insert into public.turno (perfil_id, inicio_el, foto_inicio_path, origen)
    values (p_perfil, v_ahora, p_foto_path, p_origen)
    returning id into v_turno;
    return v_turno;
  end if;

  if v_turno is null then
    raise exception 'No tienes un turno abierto.';
  end if;

  select id into v_pausa
    from public.turno_pausa
   where turno_id = v_turno and fin_el is null;

  if p_accion = 'pausa_inicio' then
    if v_pausa is not null then
      raise exception 'Ya marcaste tu salida a almorzar.';
    end if;
    insert into public.turno_pausa (turno_id, inicio_el) values (v_turno, v_ahora);
    return v_turno;

  elsif p_accion = 'pausa_fin' then
    if v_pausa is null then
      raise exception 'No tienes una pausa abierta.';
    end if;
    update public.turno_pausa set fin_el = v_ahora where id = v_pausa;
    return v_turno;

  elsif p_accion = 'salida' then
    -- ⚠️ Se bloquea a propósito cerrar con el almuerzo abierto. Dejarlo pasar
    -- tiene dos salidas y las dos están mal: contar la pausa en cero le paga el
    -- almuerzo como trabajado, y estirarla hasta el final del turno le quita
    -- horas que sí trabajó. Mejor exigir el dato ahora, con la persona presente,
    -- que dejarle el arreglo al superadministrador dos semanas después.
    if v_pausa is not null then
      raise exception 'Primero marca tu regreso del almuerzo.';
    end if;
    if p_foto_path is null then
      raise exception 'Falta la foto de salida.';
    end if;
    update public.turno
       set fin_el = v_ahora, foto_fin_path = p_foto_path
     where id = v_turno;
    return v_turno;
  end if;

  raise exception 'Acción desconocida: %', p_accion;
end;
$$;
revoke all on function private.turno_marcar(uuid, text, text, text) from public;

/** Puerta 1 · marca desde su propio celular, con su sesión. */
create or replace function public.turno_marcar(p_accion text, p_foto_path text default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perfil uuid := (select auth.uid());
begin
  if v_perfil is null then
    raise exception 'No hay sesión.';
  end if;
  if not exists (
    select 1 from public.profiles
     where id = v_perfil and activo and marca_turno
  ) then
    raise exception 'Tu cuenta no registra turnos.';
  end if;
  return private.turno_marcar(v_perfil, p_accion, p_foto_path, 'app');
end;
$$;
revoke all on function public.turno_marcar(text, text) from public;
grant execute on function public.turno_marcar(text, text) to authenticated;

/**
 * Puerta 2 · el PC de recepción marca por cuenta de otro, validando su PIN.
 *
 * ⚠️ Devuelve un estado en vez de reventar cuando el PIN está mal, y NO es un
 * capricho de estilo: una excepción revierte la transacción entera, así que el
 * `update` que suma el intento fallido se desharía y el bloqueo por intentos
 * nunca llegaría a activarse. Los demás errores sí van por excepción, porque ahí
 * no hay nada que preservar.
 */
create or replace function public.quiosco_marcar(
  p_perfil    uuid,
  p_pin       text,
  p_accion    text,
  p_foto_path text default null
)
returns table (ok boolean, mensaje text, turno_id bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pin public.turno_pin%rowtype;
begin
  if private.user_role() not in ('quiosco', 'superadmin') then
    raise exception 'Esta pantalla solo funciona en el equipo de recepción.';
  end if;
  if not exists (
    select 1 from public.profiles
     where id = p_perfil and activo and marca_turno
  ) then
    raise exception 'Esa persona no registra turnos.';
  end if;

  select * into v_pin from public.turno_pin where perfil_id = p_perfil;
  if v_pin.perfil_id is null then
    return query select false, 'Esa persona todavía no tiene PIN. Pídeselo al administrador.'::text, null::bigint;
    return;
  end if;

  if v_pin.bloqueado_hasta is not null and v_pin.bloqueado_hasta > now() then
    return query select false, 'PIN bloqueado por intentos fallidos. Intenta de nuevo en unos minutos.'::text, null::bigint;
    return;
  end if;

  if v_pin.pin_hash is distinct from extensions.crypt(p_pin, v_pin.pin_hash) then
    update public.turno_pin
       set intentos = intentos + 1,
           bloqueado_hasta = case when intentos + 1 >= 5 then now() + interval '15 minutes' end
     where perfil_id = p_perfil;
    return query select false, 'PIN incorrecto.'::text, null::bigint;
    return;
  end if;

  update public.turno_pin set intentos = 0, bloqueado_hasta = null where perfil_id = p_perfil;
  return query select true, null::text, private.turno_marcar(p_perfil, p_accion, p_foto_path, 'quiosco');
end;
$$;
revoke all on function public.quiosco_marcar(uuid, text, text, text) from public;
grant execute on function public.quiosco_marcar(uuid, text, text, text) to authenticated;

/** Lista para la pantalla del quiósco: quién marca turno y cómo va. Sin datos personales. */
create or replace function public.quiosco_estado()
returns table (
  perfil_id     uuid,
  nombre        text,
  turno_id      bigint,
  inicio_el     timestamptz,
  pausa_abierta boolean,
  tiene_pin     boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.user_role() not in ('quiosco', 'superadmin') then
    raise exception 'Esta pantalla solo funciona en el equipo de recepción.';
  end if;
  return query
    select p.id,
           coalesce(p.nombre, '(sin nombre)'),
           t.id,
           t.inicio_el,
           exists (select 1 from public.turno_pausa pa where pa.turno_id = t.id and pa.fin_el is null),
           exists (select 1 from public.turno_pin pin where pin.perfil_id = p.id)
      from public.profiles p
      left join public.turno t on t.perfil_id = p.id and t.fin_el is null
     where p.activo and p.marca_turno
     order by coalesce(p.nombre, '');
end;
$$;
revoke all on function public.quiosco_estado() from public;
grant execute on function public.quiosco_estado() to authenticated;

-- ============================================================================
-- 7 · Correcciones del superadministrador
-- ----------------------------------------------------------------------------
-- Un turno que quedó abierto NO se cierra solo: inventar la hora de salida sería
-- inventar un dato de nómina. Sale en rojo en el reporte y se corrige aquí, con
-- rastro en la bitácora.
-- ============================================================================

create or replace function private.turno_exige_sa()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.user_role() is distinct from 'superadmin' then
    raise exception 'Solo el superadministrador puede corregir turnos.';
  end if;
end;
$$;
revoke all on function private.turno_exige_sa() from public;

/** Cambia las horas de un turno existente. El motivo es obligatorio. */
create or replace function public.turno_ajustar(
  p_turno  bigint,
  p_inicio timestamptz,
  p_fin    timestamptz,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes public.turno%rowtype;
begin
  perform private.turno_exige_sa();
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Escribe el motivo de la corrección.';
  end if;

  select * into v_antes from public.turno where id = p_turno;
  if v_antes.id is null then
    raise exception 'El turno no existe.';
  end if;
  if p_fin is not null and p_fin < p_inicio then
    raise exception 'La salida no puede ser anterior a la entrada.';
  end if;

  -- Las pausas tienen que seguir cayendo dentro del turno; si no, el cálculo
  -- descontaría almuerzo fuera del horario y las horas saldrían mal en silencio.
  if exists (
    select 1 from public.turno_pausa pa
     where pa.turno_id = p_turno
       and (pa.inicio_el < date_trunc('minute', p_inicio)
            or (p_fin is not null and coalesce(pa.fin_el, pa.inicio_el) > date_trunc('minute', p_fin)))
  ) then
    raise exception 'Con esas horas el almuerzo quedaría por fuera del turno. Ajusta primero la pausa.';
  end if;

  update public.turno
     set inicio_el = p_inicio,
         fin_el = p_fin,
         ajustado_por = (select auth.uid()),
         ajuste_motivo = p_motivo
   where id = p_turno;

  insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
  values ((select auth.uid()), 'turno.ajustar', 'turno', p_turno::text,
          jsonb_build_object('inicio_el', v_antes.inicio_el, 'fin_el', v_antes.fin_el),
          jsonb_build_object('inicio_el', p_inicio, 'fin_el', p_fin, 'motivo', p_motivo));
end;
$$;
revoke all on function public.turno_ajustar(bigint, timestamptz, timestamptz, text) from public;
grant execute on function public.turno_ajustar(bigint, timestamptz, timestamptz, text) to authenticated;

/** Crea a mano un turno que nunca se marcó (se le olvidó, se fue la luz, …). */
create or replace function public.turno_crear_manual(
  p_perfil uuid,
  p_inicio timestamptz,
  p_fin    timestamptz,
  p_motivo text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  perform private.turno_exige_sa();
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Escribe el motivo.';
  end if;
  if p_fin is null or p_fin < p_inicio then
    raise exception 'Un turno creado a mano necesita entrada y salida.';
  end if;
  if exists (select 1 from public.turno where perfil_id = p_perfil and fin_el is null) then
    raise exception 'Esa persona tiene un turno abierto. Ciérralo primero.';
  end if;

  insert into public.turno (perfil_id, inicio_el, fin_el, origen, ajustado_por, ajuste_motivo)
  values (p_perfil, p_inicio, p_fin, 'ajuste', (select auth.uid()), p_motivo)
  returning id into v_id;

  insert into public.audit_log (actor_id, action, entity, entity_id, after)
  values ((select auth.uid()), 'turno.crear_manual', 'turno', v_id::text,
          jsonb_build_object('perfil_id', p_perfil, 'inicio_el', p_inicio, 'fin_el', p_fin, 'motivo', p_motivo));
  return v_id;
end;
$$;
revoke all on function public.turno_crear_manual(uuid, timestamptz, timestamptz, text) from public;
grant execute on function public.turno_crear_manual(uuid, timestamptz, timestamptz, text) to authenticated;

/** Borra un turno (marcación por error). Se lleva sus pausas por cascada. */
create or replace function public.turno_eliminar(p_turno bigint, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes public.turno%rowtype;
begin
  perform private.turno_exige_sa();
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Escribe el motivo.';
  end if;

  select * into v_antes from public.turno where id = p_turno;
  if v_antes.id is null then
    raise exception 'El turno no existe.';
  end if;

  delete from public.turno where id = p_turno;

  insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
  values ((select auth.uid()), 'turno.eliminar', 'turno', p_turno::text,
          jsonb_build_object('perfil_id', v_antes.perfil_id, 'inicio_el', v_antes.inicio_el, 'fin_el', v_antes.fin_el),
          jsonb_build_object('motivo', p_motivo));
end;
$$;
revoke all on function public.turno_eliminar(bigint, text) from public;
grant execute on function public.turno_eliminar(bigint, text) to authenticated;

/** Agrega a mano una pausa que no se marcó (se le olvidó marcar el almuerzo). */
create or replace function public.turno_pausa_fijar(
  p_turno  bigint,
  p_inicio timestamptz,
  p_fin    timestamptz,
  p_motivo text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno public.turno%rowtype;
  v_id    bigint;
begin
  perform private.turno_exige_sa();
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Escribe el motivo.';
  end if;

  select * into v_turno from public.turno where id = p_turno;
  if v_turno.id is null then
    raise exception 'El turno no existe.';
  end if;
  if p_fin is null or p_fin < p_inicio then
    raise exception 'La pausa necesita hora de salida y de regreso.';
  end if;
  if date_trunc('minute', p_inicio) < v_turno.inicio_el
     or (v_turno.fin_el is not null and date_trunc('minute', p_fin) > v_turno.fin_el) then
    raise exception 'La pausa tiene que caer dentro del turno.';
  end if;

  insert into public.turno_pausa (turno_id, inicio_el, fin_el)
  values (p_turno, p_inicio, p_fin)
  returning id into v_id;

  insert into public.audit_log (actor_id, action, entity, entity_id, after)
  values ((select auth.uid()), 'turno.pausa_fijar', 'turno', p_turno::text,
          jsonb_build_object('inicio_el', p_inicio, 'fin_el', p_fin, 'motivo', p_motivo));
  return v_id;
end;
$$;
revoke all on function public.turno_pausa_fijar(bigint, timestamptz, timestamptz, text) from public;
grant execute on function public.turno_pausa_fijar(bigint, timestamptz, timestamptz, text) to authenticated;

/** Borra una pausa mal marcada. */
create or replace function public.turno_pausa_eliminar(p_pausa bigint, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes public.turno_pausa%rowtype;
begin
  perform private.turno_exige_sa();
  select * into v_antes from public.turno_pausa where id = p_pausa;
  if v_antes.id is null then
    raise exception 'La pausa no existe.';
  end if;

  delete from public.turno_pausa where id = p_pausa;

  insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
  values ((select auth.uid()), 'turno.pausa_eliminar', 'turno', v_antes.turno_id::text,
          jsonb_build_object('inicio_el', v_antes.inicio_el, 'fin_el', v_antes.fin_el),
          jsonb_build_object('motivo', p_motivo));
end;
$$;
revoke all on function public.turno_pausa_eliminar(bigint, text) from public;
grant execute on function public.turno_pausa_eliminar(bigint, text) to authenticated;

/** Asigna (o cambia) el PIN del quiósco. El PIN nunca se guarda en claro ni entra a la bitácora. */
create or replace function public.turno_pin_asignar(p_perfil uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.turno_exige_sa();
  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'El PIN son 4 dígitos.';
  end if;

  insert into public.turno_pin (perfil_id, pin_hash, intentos, bloqueado_hasta)
  values (p_perfil, extensions.crypt(p_pin, extensions.gen_salt('bf')), 0, null)
  on conflict (perfil_id) do update
    set pin_hash = excluded.pin_hash, intentos = 0, bloqueado_hasta = null;

  insert into public.audit_log (actor_id, action, entity, entity_id, after)
  values ((select auth.uid()), 'turno.pin_asignar', 'profiles', p_perfil::text,
          jsonb_build_object('pin', 'asignado'));
end;
$$;
revoke all on function public.turno_pin_asignar(uuid, text) from public;
grant execute on function public.turno_pin_asignar(uuid, text) to authenticated;
