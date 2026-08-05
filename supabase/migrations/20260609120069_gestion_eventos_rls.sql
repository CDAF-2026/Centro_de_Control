-- ============================================================================
-- 0069 · Permisos del rol `gestion_eventos` (+ arreglo del coord. deportivo)
-- ----------------------------------------------------------------------------
-- Continúa 0068, que solo pudo crear el valor del enum (Postgres no deja usarlo
-- en la misma transacción en que se agrega).
--
-- ⚠️ ARREGLA UN BUG QUE YA ESTABA: la matriz de la app da al **coordinador
-- deportivo** edición sobre eventos desde el 31-jul, y el guard de la app lo deja
-- pasar (`rolesForModule("eventos","edit")`), pero las políticas de escritura
-- seguían en solo SA/CA. O sea que Willington veía los botones de editar y
-- CUALQUIER guardado le fallaba contra RLS. Aquí la base se pone de acuerdo con
-- la matriz, que es la que Laura decidió.
--
-- Regla que se sigue aquí: el rol nuevo NO recibe escritura sobre `siigo_facturas`.
-- Atar una factura a un evento solo cambia `evento_id`, pero una política de UPDATE
-- no puede limitar COLUMNAS — darle write sería darle la tabla del dinero entera.
-- En vez de eso, dos funciones SECURITY DEFINER que validan el rol por dentro y
-- tocan únicamente esa columna. Mismo patrón que `staff_directorio` y `nota_comentar`.
-- ============================================================================

-- ─────────────── Lectura: el rol nuevo ve lo que ve el resto del staff ───────────────
alter policy "eventos_select" on public.eventos
  using (private.user_role() in ('superadmin','coord_admin','coord_deportivo','recepcion','profesor','gestion_eventos'));
alter policy "evento_part_select" on public.evento_participantes
  using (private.user_role() in ('superadmin','coord_admin','coord_deportivo','recepcion','profesor','gestion_eventos'));
alter policy "evento_prof_select" on public.evento_profesores
  using (private.user_role() in ('superadmin','coord_admin','coord_deportivo','recepcion','profesor','gestion_eventos'));
alter policy "evento_gastos_select" on public.evento_gastos
  using (private.user_role() in ('superadmin','coord_admin','coord_deportivo','recepcion','profesor','gestion_eventos'));

-- El P&G del evento sale de las facturas de Siigo: sin esto la ficha le saldría en $0.
alter policy "siigo_fac_select" on public.siigo_facturas
  using (private.user_role() in ('superadmin','coord_admin','coord_deportivo','recepcion','profesor','gestion_eventos'));
alter policy "siigo_lin_select" on public.siigo_factura_lineas
  using (private.user_role() in ('superadmin','coord_admin','coord_deportivo','recepcion','profesor','gestion_eventos'));

-- Inscribir a un participante exige buscarlo por nombre y pintar el de los ya inscritos.
-- Ojo: es acceso de LECTURA a la tabla de clientes; el módulo /clientes le sigue oculto.
alter policy "clientes_select" on public.clientes
  using (private.user_role() in ('superadmin','coord_admin','coord_deportivo','recepcion','gestion_eventos'));

-- ─────────────── Escritura sobre el evento (control total) ───────────────
-- Entra `gestion_eventos` y entra `coord_deportivo`, que la matriz ya le daba.
alter policy "eventos_write" on public.eventos
  using (private.user_role() in ('superadmin','coord_admin','coord_deportivo','gestion_eventos'))
  with check (private.user_role() in ('superadmin','coord_admin','coord_deportivo','gestion_eventos'));
alter policy "evento_part_write" on public.evento_participantes
  using (private.user_role() in ('superadmin','coord_admin','coord_deportivo','gestion_eventos'))
  with check (private.user_role() in ('superadmin','coord_admin','coord_deportivo','gestion_eventos'));
alter policy "evento_prof_write" on public.evento_profesores
  using (private.user_role() in ('superadmin','coord_admin','coord_deportivo','gestion_eventos'))
  with check (private.user_role() in ('superadmin','coord_admin','coord_deportivo','gestion_eventos'));
alter policy "evento_gastos_write" on public.evento_gastos
  using (private.user_role() in ('superadmin','coord_admin','coord_deportivo','gestion_eventos'))
  with check (private.user_role() in ('superadmin','coord_admin','coord_deportivo','gestion_eventos'));

-- ─────────────── Soportes de gasto (bucket privado `evento-docs`) ───────────────
alter policy "evento_docs_obj_select" on storage.objects
  using (bucket_id = 'evento-docs' and private.user_role() in ('superadmin','coord_admin','coord_deportivo','gestion_eventos'));
alter policy "evento_docs_obj_insert" on storage.objects
  with check (bucket_id = 'evento-docs' and private.user_role() in ('superadmin','coord_admin','coord_deportivo','gestion_eventos'));
alter policy "evento_docs_obj_update" on storage.objects
  using (bucket_id = 'evento-docs' and private.user_role() in ('superadmin','coord_admin','coord_deportivo','gestion_eventos'));
alter policy "evento_docs_obj_delete" on storage.objects
  using (bucket_id = 'evento-docs' and private.user_role() in ('superadmin','coord_admin','coord_deportivo','gestion_eventos'));

-- ─────────────── Atar / soltar facturas sin abrir la tabla del dinero ───────────────

/**
 * Ata facturas a un evento. Devuelve cuántas quedaron atadas.
 * SECURITY DEFINER: toca `siigo_facturas`, sobre la que estos roles NO tienen
 * escritura — y no deben tenerla, porque una política de UPDATE no puede limitar
 * a la columna `evento_id`. La función es el permiso estrecho.
 * Solo ata las que están libres: si otro evento ya se llevó una, no se la quita.
 */
create or replace function public.evento_atar_facturas(p_evento bigint, p_facturas bigint[])
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cerrado timestamptz;
  v_n       int;
begin
  if private.user_role() not in ('superadmin','coord_admin','coord_deportivo','gestion_eventos') then
    raise exception 'No tienes permiso para atarle facturas a un evento.';
  end if;

  select cerrado_el into v_cerrado from public.eventos where id = p_evento;
  if not found then
    raise exception 'El evento no existe.';
  end if;
  if v_cerrado is not null then
    raise exception 'El evento está cerrado. Reábrelo para poder editarlo.';
  end if;

  update public.siigo_facturas
     set evento_id = p_evento
   where id = any (p_facturas)
     and evento_id is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

/** Suelta una factura de su evento. Falla si el evento ya está cerrado (su P&G está publicado). */
create or replace function public.evento_soltar_factura(p_factura bigint)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_evento  bigint;
  v_cerrado timestamptz;
  v_n       int;
begin
  if private.user_role() not in ('superadmin','coord_admin','coord_deportivo','gestion_eventos') then
    raise exception 'No tienes permiso para soltar facturas de un evento.';
  end if;

  select evento_id into v_evento from public.siigo_facturas where id = p_factura;
  if not found then
    raise exception 'La factura no existe.';
  end if;
  if v_evento is null then
    return 0;
  end if;

  select cerrado_el into v_cerrado from public.eventos where id = v_evento;
  if v_cerrado is not null then
    raise exception 'El evento está cerrado. Reábrelo para poder editarlo.';
  end if;

  update public.siigo_facturas set evento_id = null where id = p_factura;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.evento_atar_facturas(bigint, bigint[]) from public;
revoke all on function public.evento_soltar_factura(bigint) from public;
grant execute on function public.evento_atar_facturas(bigint, bigint[]) to authenticated;
grant execute on function public.evento_soltar_factura(bigint) to authenticated;

comment on function public.evento_atar_facturas(bigint, bigint[]) is
  'Ata facturas a un evento abierto (solo evento_id; no concilia). SECURITY DEFINER: evita darle write sobre siigo_facturas a quien gestiona eventos.';
comment on function public.evento_soltar_factura(bigint) is
  'Quita la factura de su evento. Falla si el evento está cerrado.';
