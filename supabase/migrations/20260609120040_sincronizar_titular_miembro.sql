-- ============================================================================
-- 0040 · Poner al día la fila espejo del titular en cliente_miembros
-- ----------------------------------------------------------------------------
-- El titular vive dos veces: en `clientes` (donde se edita) y en su fila de
-- `cliente_miembros` (de donde salen la tarjeta Hermanos, el selector de
-- "¿para cuál hermano?" y el buscador de miembros). Nada las sincronizaba:
--
--   · editar la ficha sólo tocaba `clientes`
--   · los backfills de EasyCancha (cédula, tipo y fecha de nacimiento)
--     escribieron sólo en `clientes` → 179 miembros sin documento y 77 sin
--     fecha, aunque la ficha sí los tenía
--   · `sync-clientes-easycancha.mjs` creaba fichas sin fila de titular (4)
--
-- Las tres fugas quedan tapadas en el código (`sincronizarTitular` en
-- clientes/actions.ts y el insert del script). Esta migración pone al día lo
-- que ya estaba desfasado. La ficha manda: el espejo se copia desde `clientes`.
-- ============================================================================

-- 1) Fichas que se quedaron sin titular: se les crea la fila.
insert into public.cliente_miembros
  (cliente_id, nombres, apellidos, fecha_nacimiento, documento, tipo_documento, deportes, es_titular)
select c.id, c.nombres, c.apellidos, c.fecha_nacimiento, c.documento, c.tipo_documento, c.deportes, true
from public.clientes c
where not exists (
  select 1 from public.cliente_miembros m where m.cliente_id = c.id and m.es_titular
);

-- 2) El espejo se iguala a la ficha (sólo donde difiere, para no tocar de más).
update public.cliente_miembros m
set nombres          = c.nombres,
    apellidos        = c.apellidos,
    fecha_nacimiento = c.fecha_nacimiento,
    documento        = c.documento,
    tipo_documento   = c.tipo_documento,
    deportes         = c.deportes
from public.clientes c
where m.cliente_id = c.id
  and m.es_titular
  and (m.nombres          is distinct from c.nombres
    or m.apellidos        is distinct from c.apellidos
    or m.fecha_nacimiento is distinct from c.fecha_nacimiento
    or m.documento        is distinct from c.documento
    or m.tipo_documento   is distinct from c.tipo_documento
    or m.deportes         is distinct from c.deportes);
