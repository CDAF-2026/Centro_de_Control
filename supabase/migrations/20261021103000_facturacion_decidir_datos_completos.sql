-- registro_facturacion_decidir: al AGREGAR un dato, la tarjeta solo traía los campos que diferían del
-- primero, así que un nombre igual (la mamá con su propio NIT y el mismo nombre que ya figuraba) quedaba
-- en NULL. Ahora lo que falta se toma de lo que la familia escribió (payload de la solicitud).
-- Caso real: Manuel Mejía Puyo, 21-oct-2026.
create or replace function public.registro_facturacion_decidir(p_cambios bigint[], p_aprobar boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cliente bigint;
  v_n       int;
  v_c       public.clientes;
  v_nit     text;
  v_nombre  text;
  v_tipo    text;
  v_email   text;
  v_otro    bigint;
  v_modo    text := 'rechazado';
begin
  if coalesce(private.user_role()::text, '') not in ('superadmin', 'coord_admin') then
    raise exception 'Solo el superadministrador o el coordinador administrativo revisan registros.' using errcode = 'P0001';
  end if;

  select min(cliente_id), count(*), count(distinct cliente_id)
    into v_cliente, v_n, v_otro
    from (select * from public.registro_cambio where id = any(p_cambios) and estado = 'pendiente' for update) x;
  if v_n = 0 or v_n <> coalesce(array_length(p_cambios, 1), 0) then
    raise exception 'Los cambios ya fueron decididos. Recarga la página.' using errcode = 'P0001';
  end if;
  if v_otro <> 1 then
    raise exception 'Los cambios son de fichas distintas.' using errcode = 'P0001';
  end if;

  if p_aprobar then
    select valor_nuevo into v_nit    from public.registro_cambio where id = any(p_cambios) and campo = 'factura_a_nit';
    select valor_nuevo into v_nombre from public.registro_cambio where id = any(p_cambios) and campo = 'factura_a_nombre';
    select valor_nuevo into v_tipo   from public.registro_cambio where id = any(p_cambios) and campo = 'factura_tipo';
    select valor_nuevo into v_email  from public.registro_cambio where id = any(p_cambios) and campo = 'factura_email';
    select * into v_c from public.clientes where id = v_cliente for update;

    if v_nit is not null then
      v_otro := private.nit_en_uso(v_nit, v_cliente);
      if v_otro is not null then
        raise exception 'Ese NIT ya es de la ficha de %. Si son la misma familia, hay que unir las fichas.',
          (select trim(nombres || ' ' || coalesce(apellidos, '')) from public.clientes where id = v_otro)
          using errcode = 'P0001';
      end if;
    end if;

    if v_nit is not null and v_c.factura_a_nit is not null and v_c.factura_a_nit <> v_nit then
      -- La tarjeta solo trae los campos que DIFIEREN del primer dato; al agregar, lo que coincidía
      -- (p. ej. el mismo nombre) viene de lo que la familia escribió en el formulario.
      select coalesce(v_nombre, nullif(trim(s.payload->'facturacion'->>'factura_a_nombre'), '')),
             coalesce(v_tipo, nullif(s.payload->'facturacion'->>'factura_tipo', '')),
             coalesce(v_email, nullif(lower(trim(s.payload->'facturacion'->>'factura_email')), ''))
        into v_nombre, v_tipo, v_email
        from public.registro_cambio rc join public.registro_solicitud s on s.id = rc.solicitud_id
       where rc.id = any(p_cambios) and rc.campo = 'factura_a_nit';
      insert into public.cliente_facturacion_extra (cliente_id, nit, nombre, tipo, email, created_by)
      values (v_cliente, v_nit, v_nombre, v_tipo, v_email, auth.uid());
      v_modo := 'agregado';
    else
      update public.clientes
         set factura_a_nit    = coalesce(v_nit, factura_a_nit),
             factura_a_nombre = coalesce(v_nombre, factura_a_nombre),
             factura_tipo     = coalesce(v_tipo, factura_tipo),
             factura_email    = coalesce(v_email, factura_email)
       where id = v_cliente;
      v_modo := 'principal';
    end if;
  end if;

  update public.registro_cambio
     set estado = case when p_aprobar then 'aprobado' else 'rechazado' end::public.cambio_estado,
         decidido_por = auth.uid(), decidido_el = now()
   where id = any(p_cambios);

  insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
  values (auth.uid(), case when p_aprobar then 'registro.cambio.aprobar' else 'registro.cambio.rechazar' end,
          'clientes', v_cliente::text,
          jsonb_build_object('factura_a_nit', v_c.factura_a_nit, 'factura_a_nombre', v_c.factura_a_nombre,
                             'factura_tipo', v_c.factura_tipo, 'factura_email', v_c.factura_email),
          jsonb_build_object('cambios', to_jsonb(p_cambios), 'modo', v_modo, 'nit', v_nit,
                             'nombre', v_nombre, 'tipo', v_tipo, 'email', v_email));

  return jsonb_build_object('cliente_id', v_cliente, 'modo', v_modo);
end;
$$;
