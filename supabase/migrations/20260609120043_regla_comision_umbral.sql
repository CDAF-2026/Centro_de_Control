-- ============================================================================
-- 0039 · Reglas: comisión al pasar un tope mensual de clases (caso Sebastián)
-- ============================================================================
-- Nuevo método `comision_umbral`: el salario fijo cubre las primeras `umbral`
-- clases del mes; desde la clase (umbral+1) se paga `pct`% del valor facturado
-- de cada clase adicional. El conteo es ACUMULADO DEL MES (no por quincena) y
-- suma TODAS las clases realizadas (particular, paquete, academia).

alter table public.profesor_regla drop constraint if exists profesor_regla_metodo_check;
alter table public.profesor_regla add constraint profesor_regla_metodo_check
  check (metodo in (
    'pct_facturado', 'fijo_por_clase', 'escalonado_asistentes', 'por_alumno',
    'pct_siigo_servicio', 'salario_fijo', 'comision_umbral'));

alter table public.profesor_regla
  add column umbral integer check (umbral is null or umbral >= 0);
comment on column public.profesor_regla.umbral is
  'Método comision_umbral: nº de clases del mes que cubre el fijo. Desde la clase umbral+1 se paga pct% del facturado.';
