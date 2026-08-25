-- `academia_ocupacion_franja` queda SIN LECTOR a propósito (25-ago-2026).
--
-- Ninguna pantalla la llama ya: los avisos de "no se dictó" y "falta cerrar"
-- salieron de la ficha del grupo porque desde ahí no se pueden arreglar. Esa
-- pantalla es de MATRÍCULA (quién está inscrito, en qué franja, dónde hay cupo)
-- y un aviso sin su botón al lado solo estorba. Cerrar una clase se hace en
-- `/cierre`, que ya lista las pendientes y marca las de +24 h; registrar el
-- bloqueo como clase se hace en `/clases`.
--
-- No se borra porque es la medición que se acordó retomar cuando (a) haya 6
-- semanas de clases registradas y (b) el coordinador pregunte por la tendencia
-- de una franja — el porqué y los bocetos están en `design/README.md`. Volver a
-- escribirla costaría rehacer lo que ya está verificado: el emparejamiento con
-- la franja MÁS CERCANA a ±20 min, el `desde_efectivo` que evita reprochar
-- clases anteriores a que el club empezara a registrar, y el `count(distinct)`
-- de "Otras horas".
--
-- ⚠️ Si se retoma, revisar antes que sus columnas sigan cuadrando con el modelo.
comment on function public.academia_ocupacion_franja is
  'APARCADA (ago-2026): sin lector en la app. Ocupación y asistencia por franja en un periodo; se retoma cuando haya historia de asistencia y el coordinador pida la tendencia (ver design/README.md). franja_id null = "Otras horas". desde_efectivo = desde cuándo se le puede exigir clase a esa franja.';
