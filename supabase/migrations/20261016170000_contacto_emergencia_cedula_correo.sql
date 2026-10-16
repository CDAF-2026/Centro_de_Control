-- ============================================================================
-- Cédula y correo del contacto de emergencia (la clienta, 16-oct-2026)
-- ----------------------------------------------------------------------------
-- En el registro público, el botón "Usar los datos del contacto de emergencia" del paso de acudientes
-- dejaba la cédula y el correo por llenar, y a la clienta no le gustó verlos resaltados como pendientes.
-- Ahora el contacto de emergencia pide también cédula y correo (opcionales, como el resto del contacto),
-- el botón copia los cinco datos, y la plataforma los guarda en la ficha.
--   1. `clientes.emergencia_documento` y `clientes.emergencia_email`.
--   2. `registro_aplicar_datos` los escribe (crear: insert; hermano/actualizar: un campo vacío no borra).
--      Cuerpo idéntico al de 20261001150000 salvo esas líneas.
-- ============================================================================

alter table public.clientes
  add column emergencia_documento text,
  add column emergencia_email text;

comment on column public.clientes.emergencia_documento is 'Cédula del contacto de emergencia (opcional; desde el 16-oct-2026).';
comment on column public.clientes.emergencia_email is 'Correo del contacto de emergencia (opcional; desde el 16-oct-2026).';

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
      emergencia_nombre, emergencia_celular, emergencia_parentesco, emergencia_documento, emergencia_email
    ) values (
      v_m->>'nombres', v_m->>'apellidos', nullif(v_m->>'documento',''), nullif(v_m->>'tipo_documento',''),
      (v_m->>'fecha_nacimiento')::date, nullif(v_m->>'lugar_nacimiento',''), nullif(v_m->>'eps',''),
      nullif(v_m->>'rh',''),
      coalesce((select array_agg(d::public.deporte) from jsonb_array_elements_text(coalesce(v_m->'deportes','[]'::jsonb)) d), '{}'),
      v_menor, v_princ_id, nullif(v_f->>'direccion',''), nullif(v_f->>'celular',''), nullif(lower(v_f->>'email'),''),
      nullif(v_f->>'emergencia_nombre',''), nullif(v_f->>'emergencia_celular',''), nullif(v_f->>'emergencia_parentesco',''),
      nullif(v_f->>'emergencia_documento',''), nullif(lower(v_f->>'emergencia_email'),'')
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
           emergencia_parentesco = coalesce(nullif(v_f->>'emergencia_parentesco',''), emergencia_parentesco),
           emergencia_documento = coalesce(nullif(v_f->>'emergencia_documento',''), emergencia_documento),
           emergencia_email = coalesce(nullif(lower(v_f->>'emergencia_email'),''), emergencia_email)
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
