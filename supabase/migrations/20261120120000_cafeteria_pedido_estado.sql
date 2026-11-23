-- Cafetería · estado de cada pedido (Laura, 20-nov-2026).
--
-- La cafetería quiere marcar en qué va cada pedido para no confundirse:
--   pendiente (como nace) → en preparación → entregado, o cancelado.
-- La pantalla "Por atender" muestra solo lo de HOY que sigue pendiente o en
-- preparación; lo entregado, lo cancelado y TODO lo de días anteriores (esté
-- como esté) pasa al historial. Eso último no necesita ninguna tarea nocturna:
-- "hoy" se calcula al leer, así que al cambiar el día la lista arranca vacía.
--
-- Solo agrega: los pedidos que ya existen quedan `pendiente`.

alter table public.cafeteria_pedidos
  add column estado     text not null default 'pendiente'
    check (estado in ('pendiente', 'en_preparacion', 'entregado', 'cancelado')),
  -- Cuándo y quién le puso el estado actual. Null = nadie lo ha tocado (sigue como nació).
  add column estado_el  timestamptz,
  add column estado_por uuid references public.profiles (id) on delete set null;

create index cafeteria_pedidos_estado_idx on public.cafeteria_pedidos (estado, recibido_el);

comment on column public.cafeteria_pedidos.estado is
  'pendiente (como nace) · en_preparacion · entregado · cancelado. Se cambia SOLO con cafeteria_pedido_estado().';

-- Cambiar el estado va por función y no por una política de UPDATE: una política
-- no puede limitar columnas, así que dar UPDATE sería dejar reescribir el pedido
-- entero (nombre, líneas, total). La función toca solo el estado y valida el rol
-- por dentro, con el mismo criterio que leer los pedidos. Devuelve el estado que
-- tenía, para poder deshacer.
create or replace function public.cafeteria_pedido_estado(p_pedido bigint, p_estado text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes text;
begin
  -- `coalesce`: con rol NULL, `not in` da NULL y NO lanza (ya mordió en facturación).
  if coalesce(private.user_role()::text, '') not in ('superadmin', 'coord_admin', 'recepcion') then
    raise exception 'No tienes permiso para cambiar el estado de un pedido.';
  end if;
  if p_estado is null or p_estado not in ('pendiente', 'en_preparacion', 'entregado', 'cancelado') then
    raise exception 'Ese estado no existe.';
  end if;

  select estado into v_antes from public.cafeteria_pedidos where id = p_pedido for update;
  if not found then
    raise exception 'Ese pedido no existe.';
  end if;

  update public.cafeteria_pedidos
     set estado = p_estado, estado_el = now(), estado_por = auth.uid()
   where id = p_pedido;
  return v_antes;
end;
$$;

revoke all on function public.cafeteria_pedido_estado(bigint, text) from public, anon;
grant execute on function public.cafeteria_pedido_estado(bigint, text) to authenticated;
