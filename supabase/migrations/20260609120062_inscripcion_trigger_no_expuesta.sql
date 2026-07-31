-- ============================================================================
-- 0062 · `inscripcion_un_deporte()` deja de ser un endpoint público
-- ----------------------------------------------------------------------------
-- La función es el DISPARADOR que impide que un niño esté a la vez en la
-- academia recreativa y en la de competencia del mismo deporte (migración 0054).
-- Nunca se llama a mano: la dispara `inscripcion_un_deporte_trg` al insertar o
-- actualizar en `inscripciones`.
--
-- Pero nació con el `EXECUTE` que Postgres le da a PUBLIC por defecto, y como
-- vive en el esquema `public`, PostgREST la publicó como
-- `/rest/v1/rpc/inscripcion_un_deporte` — invocable **sin haber iniciado
-- sesión**. Lo detectó el revisor de seguridad de Supabase antes del despliegue
-- a producción (avisos 0028 y 0029).
--
-- El daño real es bajo: llamada fuera de un trigger, `new` viene nulo y revienta
-- sola. Pero es `SECURITY DEFINER`, o sea que corre con permisos de dueño y
-- saltándose las políticas RLS, y no hay ninguna razón para que el mundo pueda
-- invocarla. Superficie de ataque gratis.
--
-- ⚠️ Quitar `EXECUTE` NO apaga el trigger: Postgres verifica ese permiso cuando
-- se CREA el trigger, no cada vez que se dispara. Verificado con prueba
-- revertida después de aplicar esta migración: la inscripción normal sigue
-- entrando y la del segundo deporte sigue siendo rechazada.
--
-- La otra función-disparador del esquema (`handle_new_user`) ya estaba cerrada;
-- esta era la única expuesta.
-- ============================================================================

revoke all on function public.inscripcion_un_deporte() from public, anon, authenticated;

comment on function public.inscripcion_un_deporte() is
  'Disparador de `inscripciones`: un niño va a una sola academia por deporte. No es invocable desde la API (ver migración 0062).';

notify pgrst, 'reload schema';
