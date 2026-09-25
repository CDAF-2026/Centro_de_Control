-- Vigencia de las reglas de pago (24-sep-2026, pedido de Laura).
--
-- La liquidación se calcula al vuelo con las reglas de HOY, así que cambiar una regla
-- reescribía en pantalla también los meses ya pagados (pasó con Cristian y Graciano el
-- 16-sep). Ahora cada regla tiene un rango de fechas y cada clase se paga con la regla
-- que estaba vigente EL DÍA de esa clase. Cambiar una regla ya no la sobrescribe: la vieja
-- se cierra el último día del mes anterior y la nueva arranca el día 1 del mes elegido.
--
-- Qué significa cada fila:
--   activo = true                         → regla del juego ACTUAL (la que se ve y edita en la
--                                            ficha). Puede arrancar en un mes futuro.
--   activo = false, vigente_hasta NOT null → versión VIEJA: ya no se edita, pero la
--                                            liquidación la usa para los meses que cubrió.
--   activo = false, vigente_hasta null     → apagada ANTES de que existiera la vigencia
--                                            (Joaquín 7 y 8, Cristian 11 y 12…). No cuenta en
--                                            ningún mes, igual que hasta hoy.

alter table public.profesor_regla
  add column vigente_desde date not null default date '2026-06-01',
  add column vigente_hasta date,
  add constraint profesor_regla_vigencia_valida
    check (vigente_hasta is null or vigente_hasta >= vigente_desde);

comment on column public.profesor_regla.vigente_desde is
  'Primer día en que la regla paga. Las que existían al crear la vigencia arrancan el 1-jun-2026 (inicio de la historia), así ninguna cifra ya mostrada se movió.';
comment on column public.profesor_regla.vigente_hasta is
  'Último día en que la regla paga (null = sigue vigente). Se llena al reemplazarla desde la ficha del empleado.';

create index profesor_regla_vigencia_idx on public.profesor_regla (profesor_id, vigente_desde);

-- Mauricio Calderón entró en septiembre (perfil del 23-sep): sus reglas no deben
-- pintarle salario en junio–agosto, que es lo que haría el 1-jun por defecto.
update public.profesor_regla r
   set vigente_desde = date '2026-09-01'
  from public.profiles p
 where p.id = r.profesor_id
   and p.nombre = 'Mauricio Calderon'
   and r.activo;

-- Aplica en UNA transacción el plan que arma `planGuardarReglas` (src/lib/reglas-vigencia.ts):
-- cerrar las versiones que cambian, borrar las que nunca llegaron a pagar e insertar las
-- nuevas. Antes era "borrar todo + insertar" en dos llamadas: si la segunda fallaba, el
-- profesor quedaba sin reglas y cobraba $0 en silencio.
-- SECURITY INVOKER a propósito: la política prof_regla_write (SA/CA) decide quién puede.
create or replace function public.profesor_reglas_aplicar(
  p_profesor uuid,
  p_cerrar jsonb,     -- [{ "id": 1, "vigente_hasta": "2026-09-30" }]
  p_borrar bigint[],
  p_insertar jsonb    -- filas completas de profesor_regla (sin id)
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  n int;
begin
  if p_borrar is not null and array_length(p_borrar, 1) > 0 then
    delete from profesor_regla where profesor_id = p_profesor and id = any (p_borrar);
    get diagnostics n = row_count;
    if n <> array_length(p_borrar, 1) then
      raise exception 'No se pudieron borrar todas las reglas (% de %).', n, array_length(p_borrar, 1);
    end if;
  end if;

  if jsonb_array_length(coalesce(p_cerrar, '[]'::jsonb)) > 0 then
    update profesor_regla r
       set activo = false,
           vigente_hasta = (c->>'vigente_hasta')::date
      from jsonb_array_elements(p_cerrar) c
     where r.profesor_id = p_profesor
       and r.id = (c->>'id')::bigint;
    get diagnostics n = row_count;
    if n <> jsonb_array_length(p_cerrar) then
      raise exception 'No se pudieron cerrar todas las reglas (% de %).', n, jsonb_array_length(p_cerrar);
    end if;
  end if;

  if jsonb_array_length(coalesce(p_insertar, '[]'::jsonb)) > 0 then
    insert into profesor_regla (
      profesor_id, nombre, concepto, metodo, pct, valor, servicio_id, escalones,
      dias, hora_desde, hora_hasta, umbral, orden, activo, vigente_desde
    )
    select p_profesor, x.nombre, x.concepto, x.metodo, coalesce(x.pct, 0), coalesce(x.valor, 0),
           x.servicio_id, x.escalones, x.dias, x.hora_desde, x.hora_hasta, x.umbral,
           x.orden, true, x.vigente_desde
      from jsonb_to_recordset(p_insertar) as x(
        nombre text, concepto text, metodo text, pct numeric, valor integer,
        servicio_id integer, escalones jsonb, dias integer[], hora_desde time, hora_hasta time,
        umbral integer, orden integer, vigente_desde date
      );
  end if;
end;
$$;

revoke all on function public.profesor_reglas_aplicar(uuid, jsonb, bigint[], jsonb) from public, anon;
grant execute on function public.profesor_reglas_aplicar(uuid, jsonb, bigint[], jsonb) to authenticated;
