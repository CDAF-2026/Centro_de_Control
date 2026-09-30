-- ============================================================================
-- 0070 · Los clientes del paquete repetido pasan al paquete bueno
-- ----------------------------------------------------------------------------
-- El catálogo 16 ("Paquete 8 clases Padel (1persona) Leo") es el MISMO paquete
-- que el 8 ("Pádel 8 clases · 1 persona"): pádel, 8 clases, 1 persona. Se había
-- dejado inactivo porque 2 clientes lo tenían y borrarlo les quitaba el nombre.
-- Como desde el 30-sep el precio ya vive en la asignación de cada cliente
-- (paquetes_cliente.precio), el catálogo solo aporta el nombre → se pueden
-- mover al 8 sin que cambie nada de lo que pagan ni de su saldo, y el 16 queda
-- libre para eliminarse desde el módulo (Laura, 30-sep-2026).
-- ============================================================================

with movidos as (
  update public.paquetes_cliente
     set catalogo_id = 8
   where catalogo_id = 16
  returning id, precio, num_clases, estado
)
insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
select null,
       'paquete.catalogo.mover',
       'paquetes_cliente',
       m.id::text,
       jsonb_build_object('catalogo_id', 16),
       jsonb_build_object('catalogo_id', 8, 'precio', m.precio, 'num_clases', m.num_clases, 'estado', m.estado,
                          'motivo', 'catálogo repetido; el precio ya está en la asignación')
  from movidos m;
