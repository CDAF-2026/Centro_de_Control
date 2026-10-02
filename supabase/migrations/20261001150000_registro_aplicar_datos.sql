-- ============================================================================
-- Registro público · Fase 3: aplicar los datos del formulario, decidir cambios
-- de facturación y asignar firmas pendientes (1-oct-2026).
-- ----------------------------------------------------------------------------
-- `registro_aplicar_datos` es UNA transacción: ficha + acudientes + miembro +
-- facturación + auditoría, o nada. Va en SQL porque supabase-js no da
-- transacciones (mismo motivo que `profesor_reglas_aplicar`).
--
-- Reglas (decisión D1 de Laura): lo que escribe el papá REEMPLAZA lo que había,
-- con el valor anterior guardado en audit_log. Excepción única: FACTURACIÓN.
-- Si ya había un NIT y llega otro, o el NIT llega "en uso" por otra ficha, no se
-- toca: queda en `registro_cambio` para que un revisor (SA / coord. admin) lo
-- apruebe. El camino público NUNCA mueve facturas de Siigo.
-- ============================================================================

-- ─────────────── ¿Ese NIT ya es de otra ficha? ───────────────
-- Misma regla que `choqueNitFacturacion` en clientes/actions.ts (cédula o NIT de
-- facturación de otro cliente). Devuelve el id del otro cliente o null.
create or replace function private.nit_en_uso(p_nit text, p_excluir bigint)
returns bigint
language sql
stable
set search_path = ''
as $$
  select c.id from public.clientes c
   where p_nit is not null and p_nit <> ''
     and (c.documento = p_nit or c.factura_a_nit = p_nit)
     and (p_excluir is null or c.id <> p_excluir)
   limit 1;
$$;

-- ─────────────── Facturación: sobrescribir o encolar ───────────────
-- Si la ficha no tenía NIT (o tenía el MISMO) y el nuevo no choca, se escribe.
-- Si había otro NIT, o el nuevo es de otra ficha, cada campo distinto va a
-- `registro_cambio` (pendiente) sin duplicar uno ya pendiente. Devuelve cuántos encoló.
create or replace function private.registro_facturacion(
  p_solicitud uuid, p_cliente bigint, p_fact jsonb
)
returns int
language plpgsql
set search_path = ''
as $$
declare
  v_c       public.clientes;
  v_nit     text := nullif(regexp_replace(coalesce(p_fact->>'factura_a_nit', ''), '\D', '', 'g'), '');
  v_nombre  text := nullif(trim(coalesce(p_fact->>'factura_a_nombre', '')), '');
  v_tipo    text := nullif(p_fact->>'factura_tipo', '');
  v_email   text := nullif(lower(trim(coalesce(p_fact->>'factura_email', ''))), '');
  v_n       int := 0;
  v_campo   text;
  v_actual  text;
  v_nuevo   text;
begin
  select * into v_c from public.clientes where id = p_cliente;
  if v_nit is null and v_nombre is null and v_tipo is null and v_email is null then
    return 0;  -- no trajo facturación: no se toca lo que hay
  end if;

  -- Directo: sin NIT previo (o el mismo) y sin choque.
  if (v_c.factura_a_nit is null or v_c.factura_a_nit = v_nit or v_nit is null)
     and private.nit_en_uso(v_nit, p_cliente) is null then
    update public.clientes
       set factura_a_nit    = coalesce(v_nit, factura_a_nit),
           factura_a_nombre = coalesce(v_nombre, factura_a_nombre),
           factura_tipo     = coalesce(v_tipo, factura_tipo),
           factura_email    = coalesce(v_email, factura_email)
     where id = p_cliente;
    return 0;
  end if;

  -- A revisión, campo por campo, solo lo que de verdad cambia.
  for v_campo, v_actual, v_nuevo in
    select * from (values
      ('factura_a_nit',    v_c.factura_a_nit,          v_nit),
      ('factura_a_nombre', v_c.factura_a_nombre,       v_nombre),
      ('factura_tipo',     v_c.factura_tipo::text,     v_tipo),
      ('factura_email',    v_c.factura_email,          v_email)
    ) as t(campo, actual, nuevo)
  loop
    if v_nuevo is not null and v_nuevo is distinct from v_actual
       and not exists (
         select 1 from public.registro_cambio
          where cliente_id = p_cliente and campo = v_campo and estado = 'pendiente' and valor_nuevo = v_nuevo
       ) then
      insert into public.registro_cambio (solicitud_id, cliente_id, campo, valor_actual, valor_nuevo)
      values (p_solicitud, p_cliente, v_campo, v_actual, v_nuevo);
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

-- ─────────────── Acudientes: crear o reemplazar por rol ───────────────
-- Uno por rol (padre/madre). "otro" se agrega si no hay ninguno "otro" con el
-- mismo documento o nombre. El principal queda en clientes.acudiente_id si la
-- ficha no tenía o si el formulario lo marca.
create or replace function private.registro_acudientes(p_cliente bigint, p_acudientes jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  a        jsonb;
  v_rol    public.acudiente_rol;
  v_id     bigint;
  v_princ  bigint;
begin
  select acudiente_id into v_princ from public.clientes where id = p_cliente;

  for a in select * from jsonb_array_elements(coalesce(p_acudientes, '[]'::jsonb)) loop
    continue when nullif(trim(coalesce(a->>'nombre', '')), '') is null;
    v_rol := coalesce(nullif(a->>'rol', ''), 'otro')::public.acudiente_rol;

    select id into v_id from public.acudientes
     where cliente_id = p_cliente
       and ((v_rol <> 'otro' and rol = v_rol)
         or (v_rol = 'otro' and rol = 'otro'
             and (documento = nullif(a->>'documento', '') or lower(nombre) = lower(a->>'nombre'))))
     order by (id = v_princ) desc, id
     limit 1;

    if v_id is null then
      insert into public.acudientes (cliente_id, rol, nombre, documento, telefono, email, parentesco)
      values (p_cliente, v_rol, a->>'nombre', nullif(a->>'documento', ''), nullif(a->>'telefono', ''),
              nullif(lower(a->>'email'), ''), nullif(a->>'parentesco', ''))
      returning id into v_id;
    else
      update public.acudientes
         set nombre = a->>'nombre', documento = nullif(a->>'documento', ''), telefono = nullif(a->>'telefono', ''),
             email = nullif(lower(a->>'email'), ''), parentesco = nullif(a->>'parentesco', '')
       where id = v_id;
    end if;

    if (a->>'principal')::boolean is true or v_princ is null then
      update public.clientes set acudiente_id = v_id where id = p_cliente;
      v_princ := v_id;
    end if;
  end loop;
end;
$$;

-- ─────────────── Aplicar la solicitud ───────────────
-- p_decision: {"modo": "crear" | "hermano" | "actualizar", "cliente_id", "miembro_id"}
-- (la decisión la toma el servidor con `buscarMiembro`, la misma búsqueda del
-- consentimiento: una sola copia).
create or replace function public.registro_aplicar_datos(p_solicitud uuid, p_decision jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sol      public.registro_solicitud;
  v_p        jsonb;
  v_m        jsonb;
  v_f        jsonb;
  v_modo     text := p_decision->>'modo';
  v_cliente  bigint := nullif(p_decision->>'cliente_id', '')::bigint;
  v_miembro  bigint := nullif(p_decision->>'miembro_id', '')::bigint;
  v_menor    boolean;
  v_princ_id bigint;
  v_antes    jsonb;
  v_pend     int := 0;
  v_creada   boolean := false;
  v_tit      boolean;
begin
  select * into v_sol from public.registro_solicitud where id = p_solicitud for update;
  if v_sol.id is null then raise exception 'Solicitud % no existe', p_solicitud using errcode = 'P0001'; end if;
  if v_sol.estado <> 'recibida' then raise exception 'La solicitud ya fue procesada (%)', v_sol.estado using errcode = 'P0001'; end if;

  v_p := v_sol.payload;
  v_m := v_p->'menor';
  v_f := v_p->'familia';
  v_menor := (v_m->>'fecha_nacimiento')::date > current_date - interval '18 years';

  if v_modo = 'crear' then
    -- Un menor exige acudiente (CHECK de clientes): el principal nace primero, sin ficha,
    -- y el trigger `clientes_acudiente_principal` lo ata al insertar la ficha.
    if v_menor then
      insert into public.acudientes (rol, nombre, documento, telefono, email, parentesco)
      select coalesce(nullif(a->>'rol',''),'otro')::public.acudiente_rol, a->>'nombre', nullif(a->>'documento',''),
             nullif(a->>'telefono',''), nullif(lower(a->>'email'),''), nullif(a->>'parentesco','')
        from jsonb_array_elements(v_p->'acudientes') a
       where (a->>'principal')::boolean is true
       limit 1
      returning id into v_princ_id;
      if v_princ_id is null then
        raise exception 'Un menor de edad necesita un acudiente' using errcode = 'P0001';
      end if;
    end if;

    insert into public.clientes (
      nombres, apellidos, documento, tipo_documento, fecha_nacimiento, lugar_nacimiento, eps, rh, deportes,
      es_menor, acudiente_id, direccion, celular, email,
      emergencia_nombre, emergencia_celular, emergencia_parentesco
    ) values (
      v_m->>'nombres', v_m->>'apellidos', nullif(v_m->>'documento',''), nullif(v_m->>'tipo_documento',''),
      (v_m->>'fecha_nacimiento')::date, nullif(v_m->>'lugar_nacimiento',''), nullif(v_m->>'eps',''),
      nullif(v_m->>'rh',''),
      coalesce((select array_agg(d::public.deporte) from jsonb_array_elements_text(coalesce(v_m->'deportes','[]'::jsonb)) d), '{}'),
      v_menor, v_princ_id, nullif(v_f->>'direccion',''), nullif(v_f->>'celular',''), nullif(lower(v_f->>'email'),''),
      nullif(v_f->>'emergencia_nombre',''), nullif(v_f->>'emergencia_celular',''), nullif(v_f->>'emergencia_parentesco','')
    ) returning id into v_cliente;
    select id into v_miembro from public.cliente_miembros where cliente_id = v_cliente and es_titular;
    v_creada := true;
    -- El resto de acudientes (el segundo) ya con ficha.
    perform private.registro_acudientes(v_cliente, (
      select coalesce(jsonb_agg(a), '[]'::jsonb) from jsonb_array_elements(v_p->'acudientes') a
       where (a->>'principal')::boolean is not true));

  elsif v_modo in ('hermano', 'actualizar') then
    if v_cliente is null then raise exception 'Falta cliente_id' using errcode = 'P0001'; end if;
    select to_jsonb(c) into v_antes from public.clientes c where c.id = v_cliente;
    if v_antes is null then raise exception 'Ficha % no existe', v_cliente using errcode = 'P0001'; end if;

    -- Primero los acudientes (un menor que entra como titular necesita el principal ANTES del CHECK).
    perform private.registro_acudientes(v_cliente, v_p->'acudientes');

    if v_modo = 'hermano' then
      insert into public.cliente_miembros (cliente_id, nombres, apellidos, documento, tipo_documento, fecha_nacimiento,
                                           lugar_nacimiento, eps, rh, deportes, es_titular)
      values (v_cliente, v_m->>'nombres', v_m->>'apellidos', nullif(v_m->>'documento',''),
              nullif(v_m->>'tipo_documento',''), (v_m->>'fecha_nacimiento')::date,
              nullif(v_m->>'lugar_nacimiento',''), nullif(v_m->>'eps',''), nullif(v_m->>'rh',''),
              coalesce((select array_agg(d::public.deporte) from jsonb_array_elements_text(coalesce(v_m->'deportes','[]'::jsonb)) d), '{}'),
              false)
      returning id into v_miembro;
    else
      select es_titular into v_tit from public.cliente_miembros where id = v_miembro and cliente_id = v_cliente;
      if v_tit is null then raise exception 'El miembro % no es de la ficha %', v_miembro, v_cliente using errcode = 'P0001'; end if;
      v_antes := v_antes || jsonb_build_object('miembro', (select to_jsonb(m) from public.cliente_miembros m where m.id = v_miembro));
      if v_tit then
        -- La ficha manda: el trigger de 0066 copia al titular.
        update public.clientes
           set nombres = v_m->>'nombres', apellidos = v_m->>'apellidos', documento = nullif(v_m->>'documento',''),
               tipo_documento = nullif(v_m->>'tipo_documento',''),
               fecha_nacimiento = (v_m->>'fecha_nacimiento')::date, lugar_nacimiento = nullif(v_m->>'lugar_nacimiento',''),
               eps = nullif(v_m->>'eps',''), rh = nullif(v_m->>'rh',''),
               deportes = coalesce((select array_agg(d::public.deporte) from jsonb_array_elements_text(coalesce(v_m->'deportes','[]'::jsonb)) d), '{}'),
               es_menor = v_menor
         where id = v_cliente;
      else
        update public.cliente_miembros
           set nombres = v_m->>'nombres', apellidos = v_m->>'apellidos', documento = nullif(v_m->>'documento',''),
               tipo_documento = nullif(v_m->>'tipo_documento',''),
               fecha_nacimiento = (v_m->>'fecha_nacimiento')::date, lugar_nacimiento = nullif(v_m->>'lugar_nacimiento',''),
               eps = nullif(v_m->>'eps',''), rh = nullif(v_m->>'rh',''),
               deportes = coalesce((select array_agg(d::public.deporte) from jsonb_array_elements_text(coalesce(v_m->'deportes','[]'::jsonb)) d), '{}')
         where id = v_miembro;
      end if;
    end if;

    -- Los datos de la familia reemplazan lo que había (D1). Un campo que llega vacío no borra.
    update public.clientes
       set direccion = coalesce(nullif(v_f->>'direccion',''), direccion),
           celular = coalesce(nullif(v_f->>'celular',''), celular),
           email = coalesce(nullif(lower(v_f->>'email'),''), email),
           emergencia_nombre = coalesce(nullif(v_f->>'emergencia_nombre',''), emergencia_nombre),
           emergencia_celular = coalesce(nullif(v_f->>'emergencia_celular',''), emergencia_celular),
           emergencia_parentesco = coalesce(nullif(v_f->>'emergencia_parentesco',''), emergencia_parentesco)
     where id = v_cliente;
  else
    raise exception 'Modo desconocido: %', v_modo using errcode = 'P0001';
  end if;

  v_pend := private.registro_facturacion(p_solicitud, v_cliente, v_p->'facturacion');

  update public.registro_solicitud
     set estado = case when v_pend > 0 then 'en_revision' else 'aplicada' end::public.registro_estado,
         cliente_id = v_cliente, miembro_id = v_miembro,
         resultado = jsonb_build_object('modo', v_modo, 'creada', v_creada, 'cambios_pendientes', v_pend)
   where id = p_solicitud;

  insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
  values (null, 'registro.aplicar', 'clientes', v_cliente::text, v_antes,
          jsonb_build_object('solicitud', p_solicitud, 'modo', v_modo, 'miembro_id', v_miembro,
                             'creada', v_creada, 'cambios_pendientes', v_pend));

  return jsonb_build_object('cliente_id', v_cliente, 'miembro_id', v_miembro, 'creada', v_creada, 'cambios_pendientes', v_pend);
end;
$$;
revoke all on function public.registro_aplicar_datos(uuid, jsonb) from public, anon, authenticated;

-- ─────────────── Bandeja: decidir un cambio de facturación ───────────────
-- Solo SA y coord. administrativo (D8). Aprobar escribe el campo (lista cerrada
-- por el CHECK de la tabla); el re-enganche de facturas de Siigo lo hace la
-- server action después, con la lógica que ya existe (nunca aquí).
create or replace function public.registro_cambio_decidir(p_cambio bigint, p_aprobar boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.registro_cambio;
  v_antes text;
begin
  if private.user_role() not in ('superadmin', 'coord_admin') then
    raise exception 'Solo el superadministrador o el coordinador administrativo revisan registros.' using errcode = 'P0001';
  end if;
  select * into v from public.registro_cambio where id = p_cambio for update;
  if v.id is null or v.estado <> 'pendiente' then
    raise exception 'El cambio no existe o ya fue decidido.' using errcode = 'P0001';
  end if;

  if p_aprobar then
    if v.campo = 'factura_a_nit' and private.nit_en_uso(v.valor_nuevo, v.cliente_id) is not null then
      raise exception 'Ese NIT ya es de otro cliente. Revisa la ficha antes de aprobar.' using errcode = 'P0001';
    end if;
    execute format('select %I::text from public.clientes where id = $1', v.campo) into v_antes using v.cliente_id;
    if v.campo = 'factura_tipo' then
      update public.clientes set factura_tipo = v.valor_nuevo where id = v.cliente_id;
    else
      execute format('update public.clientes set %I = $1 where id = $2', v.campo) using v.valor_nuevo, v.cliente_id;
    end if;
  end if;

  update public.registro_cambio
     set estado = case when p_aprobar then 'aprobado' else 'rechazado' end::public.cambio_estado,
         decidido_por = auth.uid(), decidido_el = now()
   where id = p_cambio;

  insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
  values (auth.uid(), case when p_aprobar then 'registro.cambio.aprobar' else 'registro.cambio.rechazar' end,
          'clientes', v.cliente_id::text,
          jsonb_build_object('campo', v.campo, 'valor', coalesce(v_antes, v.valor_actual)),
          jsonb_build_object('campo', v.campo, 'valor', v.valor_nuevo, 'cambio', v.id));
end;
$$;
revoke all on function public.registro_cambio_decidir(bigint, boolean) from public, anon;
grant execute on function public.registro_cambio_decidir(bigint, boolean) to authenticated;

-- ─────────────── Bandeja: asignar una firma sin dueño claro ───────────────
-- Caso extremo de D3 (dos fichas con el mismo documento Y nombre). El revisor
-- escoge al miembro; la firma pasa a `asignada` y su PDF entra a la ficha.
create or replace function private.consentimiento_crear_documento(p_firma uuid)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_f   public.consentimiento_firma;
  v_doc bigint;
begin
  select * into v_f from public.consentimiento_firma where id = p_firma;
  if v_f.estado <> 'asignada' or v_f.pdf_path is null or v_f.documento_id is not null then
    return v_f.documento_id;
  end if;
  insert into public.cliente_documentos (cliente_id, miembro_id, tipo, nombre_archivo, storage_path, bucket, origen, uploaded_by)
  values (v_f.cliente_id, v_f.miembro_id, 'consentimiento',
          'Consentimiento informado · ' || v_f.menor_nombre || ' · ' || to_char(v_f.firmado_el at time zone 'America/Bogota', 'YYYY-MM-DD') || '.pdf',
          v_f.pdf_path, 'consentimientos', 'firma_digital', null)
  returning id into v_doc;
  update public.consentimiento_firma set documento_id = v_doc where id = p_firma;
  return v_doc;
end;
$$;

-- `consentimiento_adjuntar` pasa a usar el helper (misma lógica, una copia).
create or replace function public.consentimiento_adjuntar(
  p_firma uuid, p_pdf_path text, p_png_path text, p_sha256 text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.consentimiento_firma where id = p_firma) then
    raise exception 'Firma % no existe', p_firma using errcode = 'P0001';
  end if;
  update public.consentimiento_firma
     set pdf_path = p_pdf_path, firma_png_path = p_png_path, pdf_sha256 = p_sha256
   where id = p_firma;
  return private.consentimiento_crear_documento(p_firma);
end;
$$;

create or replace function public.consentimiento_asignar(p_firma uuid, p_miembro bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_f public.consentimiento_firma;
  v_cliente bigint;
begin
  if private.user_role() not in ('superadmin', 'coord_admin') then
    raise exception 'Solo el superadministrador o el coordinador administrativo asignan firmas.' using errcode = 'P0001';
  end if;
  select * into v_f from public.consentimiento_firma where id = p_firma for update;
  if v_f.id is null or v_f.estado <> 'pendiente_asignar' then
    raise exception 'La firma no existe o ya tiene dueño.' using errcode = 'P0001';
  end if;
  select cliente_id into v_cliente from public.cliente_miembros where id = p_miembro;
  if v_cliente is null then raise exception 'Miembro % no existe', p_miembro using errcode = 'P0001'; end if;

  update public.consentimiento_firma
     set cliente_id = v_cliente, miembro_id = p_miembro, estado = 'asignada'
   where id = p_firma;
  update public.registro_solicitud set estado = 'aplicada', cliente_id = v_cliente, miembro_id = p_miembro,
         revisada_por = auth.uid(), revisada_el = now()
   where id = v_f.solicitud_id;

  insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
  values (auth.uid(), 'consentimiento.asignar', 'consentimiento_firma', p_firma::text,
          jsonb_build_object('estado', 'pendiente_asignar'), jsonb_build_object('cliente_id', v_cliente, 'miembro_id', p_miembro));

  return private.consentimiento_crear_documento(p_firma);
end;
$$;
revoke all on function public.consentimiento_asignar(uuid, bigint) from public, anon;
grant execute on function public.consentimiento_asignar(uuid, bigint) to authenticated;
