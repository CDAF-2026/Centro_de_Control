-- ============================================================================
-- 0037 · Reglas: salario fijo + filtro por día/hora (caso Willington)
-- ============================================================================
-- Amplía el modelo de reglas con:
--   • concepto 'clase'   → aplica a CUALQUIER tipo de clase (comodín; útil con filtro)
--   • concepto 'salario' → pago fijo por periodo, no ligado a clases
--   • metodo 'salario_fijo' → `valor` = salario MENSUAL (se prorratea por quincena)
--   • filtro día/hora → la regla de clase solo aplica a clases que inician en ese
--     rango horario y esos días. Willington: comisión solo por clases 07:00, lun–sáb.

alter table public.profesor_regla drop constraint if exists profesor_regla_concepto_check;
alter table public.profesor_regla add constraint profesor_regla_concepto_check
  check (concepto in ('clase_particular', 'paquete', 'academia', 'siigo', 'clase', 'salario'));

alter table public.profesor_regla drop constraint if exists profesor_regla_metodo_check;
alter table public.profesor_regla add constraint profesor_regla_metodo_check
  check (metodo in (
    'pct_facturado', 'fijo_por_clase', 'escalonado_asistentes', 'por_alumno', 'pct_siigo_servicio', 'salario_fijo'));

-- Filtro opcional (aplica a reglas de clase). null = sin filtro.
alter table public.profesor_regla
  add column dias       integer[],  -- días de la semana (0=domingo … 6=sábado); null/[] = todos
  add column hora_desde time,       -- la clase debe INICIAR a esta hora o después
  add column hora_hasta time;       -- … y antes de esta hora (rango [desde, hasta))
comment on column public.profesor_regla.dias is
  'Filtro: días de la semana en que aplica (0=domingo..6=sábado). null o vacío = todos.';
comment on column public.profesor_regla.hora_desde is
  'Filtro: la clase debe iniciar a esta hora o después. null = sin filtro.';
comment on column public.profesor_regla.hora_hasta is
  'Filtro: la clase debe iniciar antes de esta hora (exclusivo). null = sin filtro.';
