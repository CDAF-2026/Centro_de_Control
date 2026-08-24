-- ============================================================================
-- 0075 · El trigger de espejo del titular también dispara cuando cambian EPS/RH
-- ----------------------------------------------------------------------------
-- 0074 hizo que clientes_sincronizar_titular() COPIE eps/rh, pero el trigger de
-- UPDATE (0066) tiene una cláusula WHEN que solo dispara si cambian
-- nombres/apellidos/fecha/documento/tipo_documento/deportes — NO eps/rh. Efecto:
-- editar solo el EPS o el RH de una ficha no llegaba a la fila espejo del
-- titular, dejándolos desalineados (el mismo fallo silencioso que 0066 combate).
-- Se recrea el trigger agregando eps/rh a la condición.
-- ============================================================================

drop trigger if exists clientes_sincronizar_titular on public.clientes;
create trigger clientes_sincronizar_titular
  after update on public.clientes
  for each row
  when (old.nombres          is distinct from new.nombres
     or old.apellidos        is distinct from new.apellidos
     or old.fecha_nacimiento is distinct from new.fecha_nacimiento
     or old.documento        is distinct from new.documento
     or old.tipo_documento   is distinct from new.tipo_documento
     or old.eps              is distinct from new.eps
     or old.rh               is distinct from new.rh
     or old.deportes         is distinct from new.deportes)
  execute function private.clientes_sincronizar_titular();
