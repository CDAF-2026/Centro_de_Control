-- ============================================================================
-- Consumo de paquete al cerrar clase — arreglo de un fallo SILENCIOSO por RLS
-- ----------------------------------------------------------------------------
-- BUG (2026-09-04): al cerrar una clase atada a un paquete, el descuento del
-- saldo se hacía con un UPDATE directo a `paquetes_cliente`. Pero su política de
-- escritura (`paq_cli_write`) solo cubre superadmin/coord_admin/recepcion, así
-- que cuando cierra el COORD. DEPORTIVO o un PROFESOR —que son quienes cierran
-- clases— RLS rechazaba el update y, como el código no miraba el error, no se
-- descontaba nada y nadie se enteraba.
--   Medido: paquete 15 (cerrado por el SA) iba 2/2 ✔; el 16 de Daniela Parra
--   (cerrado por coord. deportivo) 0 con 2 realizadas, y el 19 (cerrado por un
--   profesor) 0 con 1 realizada. Correlación 100% con el rol de quien cerró.
--
-- Ampliar `paq_cli_write` NO sirve: daría a un profesor la tabla entera (crear,
-- borrar, cambiar num_clases o descuentos), rompiendo la matriz de permisos —
-- paquetes es E para SA/CA/recepción, L para coord. deportivo y — para profesor.
-- Una política de UPDATE no puede limitar por COLUMNA. Mismo caso que atar
-- facturas a un evento: se resuelve con una función SECURITY DEFINER que valida
-- por dentro y toca solo el saldo. De paso queda ATÓMICA (leer+sumar en una sola
-- sentencia), sin la condición de carrera del read-modify-write anterior.
-- ============================================================================

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

  -- La clase no está atada a un paquete: no hay saldo que mover.
  if v_pq is null then
    return;
  end if;

  -- Mismo criterio que para cerrar la clase: coordinación/recepción, o el
  -- profesor que la dictó. Se valida aquí porque la función salta la RLS.
  v_rol := private.user_role();
  if not (
    v_rol in ('superadmin', 'coord_admin', 'coord_deportivo', 'recepcion')
    or v_prof = (select auth.uid())
  ) then
    raise exception 'No autorizado para mover el saldo del paquete de esta clase.';
  end if;

  update public.paquetes_cliente pc
     set clases_consumidas = greatest(pc.clases_consumidas + p_delta, 0),
         -- Un paquete anulado no revive por cerrarle una clase.
         estado = (case
                     when pc.estado = 'anulado' then 'anulado'
                     when greatest(pc.clases_consumidas + p_delta, 0) >= pc.num_clases then 'agotado'
                     else 'activo'
                   end)::paquete_estado
   where pc.id = v_pq
   returning pc.num_clases, pc.clases_consumidas into v_num, v_cons;

  return query select (v_num - v_cons)::int, v_num::int;
end $$;

revoke all on function public.paquete_consumir(bigint, int) from public;
grant execute on function public.paquete_consumir(bigint, int) to authenticated;

-- ─────────────── Corrección de los saldos que quedaron mal ───────────────
-- La verdad es el número de clases REALIZADAS atadas a cada paquete (el cierre
-- es el único camino que consume saldo). Solo se tocan las filas descuadradas.
with real as (
  select pc.id,
         count(cl.id) filter (where cl.estado = 'realizada')::int as realizadas
  from public.paquetes_cliente pc
  left join public.clases cl on cl.paquete_cliente_id = pc.id
  group by pc.id
)
update public.paquetes_cliente pc
   set clases_consumidas = real.realizadas,
       -- Solo se corrige el estado si se agotó; no se revive un vencido/anulado.
       estado = case
                  when pc.estado = 'activo' and real.realizadas >= pc.num_clases then 'agotado'::paquete_estado
                  else pc.estado
                end
  from real
 where real.id = pc.id
   and pc.clases_consumidas is distinct from real.realizadas;
