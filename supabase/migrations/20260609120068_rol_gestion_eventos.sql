-- ============================================================================
-- 0068 · Rol nuevo: gestión de eventos
-- ----------------------------------------------------------------------------
-- Laura necesita que Leo Ruíz maneje los torneos sin darle nada más. Los permisos
-- de esta app son por ROL (requireRole compara contra profiles.role y las políticas
-- filtran por private.user_role()), así que no había forma de abrirle un módulo a
-- una sola persona. En vez de inventar un sistema de excepciones por usuario —que
-- habría que hacer visible también desde Postgres para que sirva de algo—, se crea
-- un rol con exactamente dos módulos: eventos (control total) y notas.
--
-- ⚠️ Esta migración hace SOLO el `alter type`. Postgres no permite USAR un valor de
-- enum en la misma transacción en que se agrega, así que las políticas que lo
-- referencian van en 0069. Si se juntan, la migración falla con
-- "unsafe use of new value of enum type".
-- ============================================================================

alter type public.app_role add value if not exists 'gestion_eventos';
