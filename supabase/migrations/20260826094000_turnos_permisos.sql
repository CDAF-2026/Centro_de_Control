-- ============================================================================
-- 0082 · Cerrar de verdad las tablas de turnos
-- ----------------------------------------------------------------------------
-- ⚠️ HALLAZGO al escribir las pruebas: en Supabase "no dar grants" NO cierra
-- nada. El proyecto trae `alter default privileges … grant all on tables to
-- anon, authenticated`, así que toda tabla nueva del esquema público nace con
-- SELECT, INSERT, UPDATE y DELETE para los dos roles. Medido sobre las cuatro
-- tablas de este módulo: las cuatro tenían los siete privilegios para `anon` y
-- para `authenticated`.
--
-- En la práctica nadie podía escribir, porque `turno` y `turno_pausa` tienen RLS
-- sin políticas de escritura y eso ya niega. Pero deja dos cosas mal:
--
--   1. La única defensa de la tabla de NÓMINA era la RLS. Un `disable row level
--      security` de más en cualquier migración futura la habría dejado abierta a
--      cualquiera con sesión, sin que nada lo delatara.
--   2. `turno_pin` "no se podía leer" solo porque la RLS sin políticas devuelve
--      CERO FILAS — no un error. O sea que una política de lectura agregada por
--      descuido publicaría los hash de los PIN, que con 4 dígitos son 10.000
--      combinaciones y se revientan en milisegundos.
--
-- Aquí se quitan los privilegios y se devuelve SOLO lo que hace falta: leer. Las
-- escrituras siguen entrando exclusivamente por las funciones SECURITY DEFINER,
-- que corren como dueñas de la tabla y no dependen de estos grants.
-- ============================================================================

revoke all on public.turno       from anon, authenticated;
revoke all on public.turno_pausa from anon, authenticated;
revoke all on public.turno_pin   from anon, authenticated;
revoke all on public.festivo     from anon, authenticated;

-- Leer sí: la RLS de cada tabla decide QUÉ filas (lo suyo, o todo si es
-- superadministrador), y `turnos_horas`/`turnos_listar` se apoyan en eso porque
-- corren con la sesión de quien pregunta.
grant select on public.turno       to authenticated;
grant select on public.turno_pausa to authenticated;
grant select on public.festivo     to authenticated;

-- `turno_pin` no se le entrega a nadie: ni leer. Solo entran las funciones.
