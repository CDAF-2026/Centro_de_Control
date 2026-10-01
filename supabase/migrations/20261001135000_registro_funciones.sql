-- ============================================================================
-- Registro público y consentimiento digital · funciones (Fase 1, 1-oct-2026)
-- ----------------------------------------------------------------------------
-- Las que llama la página pública son `security definer` e invocables SOLO por
-- service_role (revoke de public/anon/authenticated): el navegador nunca habla
-- con la base, y el servidor valida con zod antes de llamar.
--
-- Aquí van las que no dependen del formulario de datos (Fase 3):
--   nota_sistema_roles · registro_permitido · consentimiento_firmar ·
--   consentimiento_adjuntar · consentimiento_anular · registro_limpiar (+ cron).
-- `registro_aplicar_datos` y las de la bandeja llegan con la Fase 3, cuando el
-- payload del formulario esté definido: escribirlas antes sería adivinar.
-- ============================================================================

-- ─────────────── Nota automática a varios roles ───────────────
-- Generaliza `private.nota_sistema_superadmins` (20260925110000). Avisa a los
-- revisores sin inventar un canal nuevo: la campanita de Notas ya existe.
create or replace function private.nota_sistema_roles(p_texto text, p_roles public.app_role[])
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  insert into public.notas (texto, autor_id, prioridad)
  values (p_texto, null, 'normal')
  returning id into v_id;

  insert into public.nota_destinatarios (nota_id, perfil_id)
  select v_id, p.id from public.profiles p where p.role = any(p_roles) and p.activo;

  return v_id;
end;
$$;
revoke all on function private.nota_sistema_roles(text, public.app_role[]) from public, anon, authenticated;

-- ─────────────── Rate limit ───────────────
-- Cuenta los intentos de esa IP (hash) en 10 minutos y en 24 horas, registra
-- el intento, y dice si se puede seguir. Topes iniciales: 10 / 10 min · 40 / día.
-- Un papá con tres hijos hace ~6 envíos; un robot, cientos.
create or replace function public.registro_permitido(p_ip_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_10min int;
  v_dia   int;
begin
  select count(*) filter (where created_at > now() - interval '10 minutes'),
         count(*)
    into v_10min, v_dia
    from public.registro_intento
   where ip_hash = p_ip_hash
     and created_at > now() - interval '24 hours';

  insert into public.registro_intento (ip_hash) values (p_ip_hash);

  return v_10min < 10 and v_dia < 40;
end;
$$;
revoke all on function public.registro_permitido(text) from public, anon, authenticated;

-- ─────────────── Firmar ───────────────
-- Crea la fila de evidencia con la hora del SERVIDOR. Con `cliente_id` y
-- `miembro_id` queda `asignada`; sin ellos (ficha duplicada, D3) queda
-- `pendiente_asignar` para que un revisor la ate. El PDF viene después
-- (`consentimiento_adjuntar`): si la generación falla, la firma ya existe y se
-- puede regenerar desde la evidencia.
create or replace function public.consentimiento_firmar(p_datos jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version  public.consentimiento_version;
  v_cliente  bigint := nullif(p_datos->>'cliente_id', '')::bigint;
  v_miembro  bigint := nullif(p_datos->>'miembro_id', '')::bigint;
  v_id       uuid;
begin
  v_version := public.consentimiento_version_vigente();
  if v_version.id is null then
    raise exception 'No hay una versión vigente del consentimiento.' using errcode = 'P0001';
  end if;

  -- El miembro tiene que ser de esa ficha: una firma no se cuelga de cualquiera.
  if v_miembro is not null and not exists (
    select 1 from public.cliente_miembros m where m.id = v_miembro and m.cliente_id = v_cliente
  ) then
    raise exception 'El miembro % no pertenece a la ficha %', v_miembro, v_cliente using errcode = 'P0001';
  end if;

  insert into public.consentimiento_firma (
    solicitud_id, sesion_id, version_id, cliente_id, miembro_id, estado,
    firmante_nombre, firmante_documento, firmante_parentesco, firmante_celular, firmante_email,
    menor_nombre, menor_documento, menor_rh, eps, metodo, ip, user_agent
  ) values (
    nullif(p_datos->>'solicitud_id', '')::uuid,
    nullif(p_datos->>'sesion_id', '')::uuid,
    v_version.id,
    v_cliente,
    v_miembro,
    case when v_cliente is not null and v_miembro is not null then 'asignada' else 'pendiente_asignar' end::public.firma_estado,
    p_datos->>'firmante_nombre',
    p_datos->>'firmante_documento',
    nullif(p_datos->>'firmante_parentesco', ''),
    nullif(p_datos->>'firmante_celular', ''),
    nullif(p_datos->>'firmante_email', ''),
    p_datos->>'menor_nombre',
    nullif(p_datos->>'menor_documento', ''),
    nullif(p_datos->>'menor_rh', ''),
    nullif(p_datos->>'eps', ''),
    (p_datos->>'metodo')::public.firma_metodo,
    nullif(p_datos->>'ip', '')::inet,
    nullif(p_datos->>'user_agent', '')
  )
  returning id into v_id;

  insert into public.audit_log (actor_id, action, entity, entity_id, after)
  values (null, 'consentimiento.firmar', 'consentimiento_firma', v_id::text,
          jsonb_build_object('cliente_id', v_cliente, 'miembro_id', v_miembro, 'version', v_version.codigo));

  return v_id;
end;
$$;
revoke all on function public.consentimiento_firmar(jsonb) from public, anon, authenticated;

-- ─────────────── Adjuntar el PDF ───────────────
-- Guarda rutas y huella. Si la firma está asignada, registra el documento en la
-- ficha del niño (bucket `consentimientos`, origen `firma_digital`) y devuelve
-- su id; si está pendiente, devuelve null y el documento se crea al asignarla.
create or replace function public.consentimiento_adjuntar(
  p_firma uuid, p_pdf_path text, p_png_path text, p_sha256 text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_f    public.consentimiento_firma;
  v_doc  bigint;
begin
  select * into v_f from public.consentimiento_firma where id = p_firma for update;
  if v_f.id is null then
    raise exception 'Firma % no existe', p_firma using errcode = 'P0001';
  end if;

  update public.consentimiento_firma
     set pdf_path = p_pdf_path, firma_png_path = p_png_path, pdf_sha256 = p_sha256
   where id = p_firma;

  if v_f.estado = 'asignada' and v_f.documento_id is null then
    insert into public.cliente_documentos (cliente_id, miembro_id, tipo, nombre_archivo, storage_path, bucket, origen, uploaded_by)
    values (v_f.cliente_id, v_f.miembro_id, 'consentimiento',
            'Consentimiento informado · ' || v_f.menor_nombre || ' · ' || to_char(v_f.firmado_el at time zone 'America/Bogota', 'YYYY-MM-DD') || '.pdf',
            p_pdf_path, 'consentimientos', 'firma_digital', null)
    returning id into v_doc;

    update public.consentimiento_firma set documento_id = v_doc where id = p_firma;
  end if;

  return v_doc;
end;
$$;
revoke all on function public.consentimiento_adjuntar(uuid, text, text, text) from public, anon, authenticated;

-- ─────────────── Anular (solo superadministrador) ───────────────
-- Estado + motivo + auditoría. El archivo no se toca: sigue siendo evidencia
-- de que existió, y el bucket no deja borrarlo con sesión de todos modos.
create or replace function public.consentimiento_anular(p_firma uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_f public.consentimiento_firma;
begin
  if private.user_role() is distinct from 'superadmin' then
    raise exception 'Solo el superadministrador puede anular una firma.' using errcode = 'P0001';
  end if;
  if coalesce(length(trim(p_motivo)), 0) < 3 then
    raise exception 'Escribe el motivo de la anulación.' using errcode = 'P0001';
  end if;

  select * into v_f from public.consentimiento_firma where id = p_firma for update;
  if v_f.id is null then
    raise exception 'Firma % no existe', p_firma using errcode = 'P0001';
  end if;
  if v_f.estado = 'anulada' then
    return;
  end if;

  update public.consentimiento_firma
     set estado = 'anulada', anulada_por = auth.uid(), anulada_el = now(), motivo_anulacion = trim(p_motivo)
   where id = p_firma;

  insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
  values (auth.uid(), 'consentimiento.anular', 'consentimiento_firma', p_firma::text,
          to_jsonb(v_f), jsonb_build_object('motivo', trim(p_motivo)));
end;
$$;
revoke all on function public.consentimiento_anular(uuid, text) from public, anon;
grant execute on function public.consentimiento_anular(uuid, text) to authenticated;

-- ─────────────── Limpieza nocturna ───────────────
-- Expira lo que nadie terminó, purga los datos personales de las solicitudes ya
-- aplicadas (90 días) y los intentos viejos. NUNCA toca `consentimiento_firma`
-- ni los archivos. Devuelve cuánto hizo, para leerlo en cron.job_run_details.
create or replace function public.registro_limpiar()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  n_sesiones int; n_solicitudes int; n_payloads int; n_intentos int;
begin
  update public.registro_sesion set cerrada = true
   where not cerrada and expira_el < now();
  get diagnostics n_sesiones = row_count;

  update public.registro_solicitud set estado = 'expirada'
   where estado = 'recibida' and expira_el < now();
  get diagnostics n_solicitudes = row_count;

  update public.registro_solicitud set payload = null
   where payload is not null
     and estado in ('aplicada', 'rechazada', 'expirada')
     and created_at < now() - interval '90 days';
  get diagnostics n_payloads = row_count;

  delete from public.registro_intento where created_at < now() - interval '2 days';
  get diagnostics n_intentos = row_count;

  delete from public.registro_sesion where cerrada and expira_el < now() - interval '7 days';

  return jsonb_build_object('sesiones', n_sesiones, 'solicitudes', n_solicitudes,
                            'payloads', n_payloads, 'intentos', n_intentos);
end;
$$;
revoke all on function public.registro_limpiar() from public, anon, authenticated;

-- 02:50 a. m. de Bogotá (07:50 UTC), con el club cerrado, junto a las otras tareas.
do $$
begin
  perform cron.unschedule('registro-limpiar');
exception when others then null;  -- aún no existía
end $$;

select cron.schedule(
  'registro-limpiar',
  '50 7 * * *',
  $$select public.registro_limpiar()$$
);
