-- ============================================================================
-- 0078 · Dos roles nuevos para el módulo de turnos
-- ----------------------------------------------------------------------------
--   · `seguridad`  → Carlos, el vigilante. Abre y cierra el club. NO ve ningún
--                    módulo: lo único que puede hacer es marcar su turno.
--   · `quiosco`    → NO es una persona: es el PC de recepción. Una cuenta que
--                    vive con la sesión abierta en ese computador y que solo
--                    puede pintar la pantalla de marcar. Existe porque marcar
--                    turno exige haber entrado a la plataforma, y sin ella
--                    Camila tendría que cerrar su sesión cada vez que otro
--                    llega a marcar.
--
-- Los dos son los primeros roles SIN NINGÚN MÓDULO, y eso tiene consecuencias
-- fuera de la base: `rutaInicio()` manda a todo el que no es superadministrador
-- a /notas, así que a estos dos hay que darles otra pantalla de inicio o quedan
-- rebotando sin poder entrar a ninguna parte. Va en `permissions.ts`.
--
-- ⚠️ Esta migración hace SOLO el `alter type`. Postgres no permite USAR un valor
-- de enum en la misma transacción en que se agrega ("unsafe use of new value of
-- enum type"), y `db-apply` manda cada archivo como una sola transacción. Las
-- políticas que los nombran van en 20260826092000_turnos.sql.
--
-- ⚠️ Un rol nuevo se toca en DOS sitios más, o queda mudo: `ALL_ROLES` y
-- `PERMISSIONS` en src/lib/auth/permissions.ts. De ALL_ROLES salen casi todos
-- los `requireRole`, así que un rol que esté en la matriz pero no en la lista
-- tiene permisos que nunca se aplican.
-- ============================================================================

alter type public.app_role add value if not exists 'seguridad';
alter type public.app_role add value if not exists 'quiosco';
