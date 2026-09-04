-- ============================================================================
-- Un paquete VENCIDO deja de estar disponible (y no revive)
-- ----------------------------------------------------------------------------
-- El estado `vencido` existía en el enum pero NADIE lo ponía nunca: los 8
-- paquetes estaban en `activo`, incluso los que pasaran su `vence_el`. Dos
-- consecuencias: (a) al pasar la fecha se seguirían ofreciendo para cobrar una
-- clase, y (b) cerrar una clase vieja contra un paquete vencido lo devolvía a
-- `activo` (el CASE solo blindaba `anulado`).
--
-- Se arregla con DOS capas, a propósito:
--   1. La verdad guardada: un job nocturno marca `activo → vencido` al pasar la
--      fecha, para que CUALQUIER consulta que filtre por `estado = 'activo'`
--      quede bien sola — incluida la que alguien escriba mañana.
--   2. La fecha, en el momento de ofrecer: las listas y la validación del
--      servidor exigen además `vence_el >= hoy`, así no hay ventana entre que
--      vence y corre el job.
-- ============================================================================

-- ─────────── 1. `vencido` y `anulado` son terminales: no reviven ───────────
create or replace function public.paquete_consumir(p_clase bigint, p_delta int default 1)
returns table (restante int, total int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pq   bigint;
  v_prof uuid;
  v_rol  app_role;
  v_num  int;
  v_cons int;
begin
  select c.paquete_cliente_id, c.profesor_id into v_pq, v_prof
  from public.clases c
  where c.id = p_clase;

  if v_pq is null then
    return;
  end if;

  v_rol := private.user_role();
  if not (
    v_rol in ('superadmin', 'coord_admin', 'coord_deportivo', 'recepcion')
    or v_prof = (select auth.uid())
  ) then
    raise exception 'No autorizado para mover el saldo del paquete de esta clase.';
  end if;

  update public.paquetes_cliente pc
     set clases_consumidas = greatest(pc.clases_consumidas + p_delta, 0),
         estado = case
                    -- Cerrar una clase vieja no resucita un paquete muerto.
                    when pc.estado in ('anulado', 'vencido') then pc.estado
                    when greatest(pc.clases_consumidas + p_delta, 0) >= pc.num_clases
                      then 'agotado'::paquete_estado
                    else 'activo'::paquete_estado
                  end
   where pc.id = v_pq
   returning pc.num_clases, pc.clases_consumidas into v_num, v_cons;

  return query select (v_num - v_cons)::int, v_num::int;
end $$;

revoke all on function public.paquete_consumir(bigint, int) from public;
grant execute on function public.paquete_consumir(bigint, int) to authenticated;

-- ─────────── 2. Marcar los vencidos (job nocturno) ───────────
-- Solo `activo → vencido`: un agotado ya no ofrece saldo y un anulado es final.
create or replace function public.paquetes_marcar_vencidos()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  update public.paquetes_cliente
     set estado = 'vencido'::paquete_estado
   where estado = 'activo'
     and vence_el is not null
     and vence_el < current_date;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.paquetes_marcar_vencidos() from public;

-- A la 1:15 a. m. de Bogotá (06:15 UTC), con el club cerrado.
do $$
begin
  perform cron.unschedule('paquetes-marcar-vencidos');
exception when others then null;  -- aún no existía
end $$;

select cron.schedule(
  'paquetes-marcar-vencidos',
  '15 6 * * *',
  $$select public.paquetes_marcar_vencidos()$$
);

-- Deja la verdad al día de una vez (hoy no hay ninguno vencido, pero por si acaso).
select public.paquetes_marcar_vencidos();
