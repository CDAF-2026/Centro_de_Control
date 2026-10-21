-- ════════════════════════════════════════════════════════════════════════════
-- Varios datos de facturación por ficha (Laura, 21-oct-2026)
--
-- A un niño le puede pagar el papá o la mamá, cada uno con su cédula o NIT. Hasta hoy
-- la ficha guardaba UN dato (clientes.factura_*), y lo que se pagaba con el otro número
-- caía en la Bolsa sin dueño: al 21-oct había 84 facturas ($11.737.700) pagadas con la
-- cédula de 16 mamás o papás registrados como acudientes de la ficha de sus hijos.
--
-- Modelo: clientes.factura_* sigue siendo el PRIMER dato (nada de lo que ya lo usa
-- cambia); esta tabla guarda los DEMÁS. Siigo ata a la ficha cualquier factura cuyo
-- número sea el documento, el primer NIT o cualquiera de estos.
--
-- Regla que se mantiene: un NIT, una ficha. El índice único lo cuida entre filas de
-- esta tabla; `private.nit_en_uso` lo cuida contra clientes.documento/factura_a_nit.
-- ════════════════════════════════════════════════════════════════════════════

create table public.cliente_facturacion_extra (
  id          bigint generated always as identity primary key,
  cliente_id  bigint not null references public.clientes(id) on delete cascade,
  nit         text not null check (nit ~ '^[0-9]+$'),
  nombre      text,
  tipo        text check (tipo is null or tipo in ('natural', 'juridica')),
  email       text,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid()
);
create unique index cliente_facturacion_extra_nit_key on public.cliente_facturacion_extra (nit);
create index cliente_facturacion_extra_cliente_idx on public.cliente_facturacion_extra (cliente_id);

comment on table public.cliente_facturacion_extra is
  'Datos de facturación adicionales de una ficha (el primero vive en clientes.factura_*). Un NIT, una ficha.';

alter table public.cliente_facturacion_extra enable row level security;
grant select, insert, update, delete on public.cliente_facturacion_extra to authenticated;

-- Mismos roles que la ficha: lo ve quien ve clientes; lo cambia quien edita clientes.
create policy cliente_facturacion_extra_select on public.cliente_facturacion_extra for select to authenticated
  using (private.user_role() = any (array['superadmin', 'coord_admin', 'coord_deportivo', 'recepcion', 'gestion_eventos']::public.app_role[]));
create policy cliente_facturacion_extra_insert on public.cliente_facturacion_extra for insert to authenticated
  with check (private.user_role() = any (array['superadmin', 'coord_admin', 'recepcion', 'gestion_eventos']::public.app_role[]));
create policy cliente_facturacion_extra_update on public.cliente_facturacion_extra for update to authenticated
  using (private.user_role() = any (array['superadmin', 'coord_admin', 'recepcion', 'gestion_eventos']::public.app_role[]))
  with check (private.user_role() = any (array['superadmin', 'coord_admin', 'recepcion', 'gestion_eventos']::public.app_role[]));
create policy cliente_facturacion_extra_delete on public.cliente_facturacion_extra for delete to authenticated
  using (private.user_role() = any (array['superadmin', 'coord_admin', 'recepcion', 'gestion_eventos']::public.app_role[]));

-- ─────────────── Un NIT, una ficha: ahora mira también los adicionales ───────────────
create or replace function private.nit_en_uso(p_nit text, p_excluir bigint)
returns bigint
language sql
stable
set search_path = ''
as $$
  select id from (
    select c.id from public.clientes c
     where (c.documento = p_nit or c.factura_a_nit = p_nit)
    union all
    select e.cliente_id from public.cliente_facturacion_extra e
     where e.nit = p_nit
  ) t
   where p_nit is not null and p_nit <> ''
     and (p_excluir is null or t.id <> p_excluir)
   limit 1;
$$;

-- ─────────────── QR: si el NIT ya es uno de los adicionales, se actualiza ese ───────────────
-- Lo demás queda igual: sin NIT previo (o el mismo) va directo al primer dato; uno distinto
-- va a la bandeja, y aprobarlo lo AGREGA (registro_facturacion_decidir), no lo reemplaza.
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

  -- Ya es uno de los datos adicionales de esta ficha: se refrescan sus datos y listo.
  if v_nit is not null and exists (
       select 1 from public.cliente_facturacion_extra where cliente_id = p_cliente and nit = v_nit
     ) then
    update public.cliente_facturacion_extra
       set nombre = coalesce(v_nombre, nombre),
           tipo   = coalesce(v_tipo, tipo),
           email  = coalesce(v_email, email)
     where cliente_id = p_cliente and nit = v_nit;
    return 0;
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

-- ─────────────── Bandeja: decidir la tarjeta de facturación entera, de una vez ───────────────
-- Reemplaza el bucle campo por campo de la app (que podía dejar media facturación aprobada
-- si el NIT fallaba). Al aprobar:
--  · la ficha sin NIT → los datos quedan como su primer dato (como siempre);
--  · la ficha con otro NIT → se AGREGAN como un dato más; el que tenía se conserva;
--  · sin NIT en la tarjeta (solo nombre/tipo/correo) → se corrigen en el primer dato.
-- Un NIT que ya es de otra ficha no se aprueba: hay que unir las fichas o decidir a cuál va.
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
  if private.user_role() not in ('superadmin', 'coord_admin') then
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
revoke all on function public.registro_facturacion_decidir(bigint[], boolean) from public, anon;
grant execute on function public.registro_facturacion_decidir(bigint[], boolean) to authenticated;
