-- ============================================================================
-- 0066 · Toda ficha nace con su fila de titular (y el espejo se mantiene solo)
-- ----------------------------------------------------------------------------
-- SÍNTOMA: al profesor le salía "Sin deportista" en /cierre en vez del nombre
-- del alumno. La pantalla de cierre saca el nombre de `cliente_miembros` (la
-- operación cuelga del MIEMBRO, no de la ficha), y si la ficha no tiene su fila
-- de titular no hay nombre que mostrar.
--
-- CAUSA: la migración 0040 tapó tres fugas de fichas sin titular, pero se le
-- escapó una CUARTA: `sincronizarClientesEC` (el botón "Sincronizar clientes de
-- EasyCancha" DENTRO de la app, clientes/actions.ts) inserta en `clientes` en
-- lote y nunca creó el miembro. Medido el 4-ago-2026: 48 de 320 fichas sin
-- titular, TODAS de las tres corridas de ese botón que quedaron en audit_log
-- (27 el 31-jul + 10 el 3-ago + 11 el 4-ago = 48 exactas). El importador de CSV
-- (clientes/importar/actions.ts) tenía la misma fuga, aún sin usar.
--
-- POR QUÉ VA EN TRIGGER Y NO EN EL CÓDIGO: ya se arregló "en el código" una vez
-- (0040) y la fuga volvió a abrirse por otra puerta. Hay cinco sitios que crean
-- fichas (formulario, dos sincronizaciones de EasyCancha, importador de CSV y
-- el script de importación) y basta que UNO olvide el miembro para que el fallo
-- reaparezca — y reaparece EN SILENCIO: la ficha se ve bien en /clientes, solo
-- se rompe al cerrar la clase, semanas después. La invariante "toda ficha tiene
-- su titular" es de la base, así que la hace cumplir la base.
-- ============================================================================

-- ─────────────── 1) Al crear la ficha, nace su titular ───────────────
create or replace function private.clientes_crear_titular()
returns trigger
language plpgsql
security definer            -- para no depender del rol que esté insertando
set search_path = public
as $$
begin
  insert into public.cliente_miembros
    (cliente_id, nombres, apellidos, fecha_nacimiento, documento, tipo_documento, deportes, es_titular)
  values
    (new.id, new.nombres, new.apellidos, new.fecha_nacimiento, new.documento,
     new.tipo_documento, coalesce(new.deportes, '{}'), true)
  on conflict do nothing;   -- idempotente: si el código ya lo creó, no estorba
  return new;
end;
$$;

comment on function private.clientes_crear_titular() is
  'Crea la fila espejo del titular en cliente_miembros. La operación (asistencia, paquetes, inscripciones) cuelga del miembro: una ficha sin titular sale como "Sin deportista" al cerrar la clase.';

drop trigger if exists clientes_crear_titular on public.clientes;
create trigger clientes_crear_titular
  after insert on public.clientes
  for each row execute function private.clientes_crear_titular();

-- ─────────────── 2) Al editar la ficha, el espejo la sigue ───────────────
-- La ficha manda (misma regla que 0040). Antes esto solo lo hacía
-- `sincronizarTitular` en clientes/actions.ts, así que los backfills que
-- escriben directo en `clientes` (cédula/tipo/nacimiento desde EasyCancha)
-- dejaban el espejo desfasado — es justo lo que 0040 tuvo que venir a corregir
-- a mano. Solo se toca el TITULAR: los hermanos tienen vida propia.
create or replace function private.clientes_sincronizar_titular()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.cliente_miembros
     set nombres          = new.nombres,
         apellidos        = new.apellidos,
         fecha_nacimiento = new.fecha_nacimiento,
         documento        = new.documento,
         tipo_documento   = new.tipo_documento,
         deportes         = coalesce(new.deportes, '{}')
   where cliente_id = new.id
     and es_titular;
  return new;
end;
$$;

comment on function private.clientes_sincronizar_titular() is
  'Copia a la fila del titular los datos de identidad de la ficha. La ficha manda; los hermanos no se tocan.';

drop trigger if exists clientes_sincronizar_titular on public.clientes;
create trigger clientes_sincronizar_titular
  after update on public.clientes
  for each row
  when (old.nombres          is distinct from new.nombres
     or old.apellidos        is distinct from new.apellidos
     or old.fecha_nacimiento is distinct from new.fecha_nacimiento
     or old.documento        is distinct from new.documento
     or old.tipo_documento   is distinct from new.tipo_documento
     or old.deportes         is distinct from new.deportes)
  execute function private.clientes_sincronizar_titular();

-- ─────────────── 3) Poner al día las 48 fichas que ya estaban sin titular ───────────────
insert into public.cliente_miembros
  (cliente_id, nombres, apellidos, fecha_nacimiento, documento, tipo_documento, deportes, es_titular)
select c.id, c.nombres, c.apellidos, c.fecha_nacimiento, c.documento, c.tipo_documento,
       coalesce(c.deportes, '{}'), true
from public.clientes c
where not exists (
  select 1 from public.cliente_miembros m where m.cliente_id = c.id and m.es_titular
);

-- Las clases ya creadas NO se tocan: cuando la clase no fija miembro (17 de 18
-- individuales hoy), la pantalla cae al titular de la ficha, y con la fila
-- creada arriba ese respaldo ya funciona.
