-- Se retira el modelo VIEJO de cobros internos: `pagos`, `asignaciones_pago` y
-- `abonos`.
--
-- Desde que **Siigo manda para el dinero** (ingresos/pagos/deuda = facturas de
-- Siigo) estas tres tablas dejaron de escribirse. Medido antes de borrar:
-- **0 filas las tres**, así que no hay historia que perder — la historia del
-- dinero vive en `siigo_facturas` / `siigo_factura_lineas`.
--
-- ⚠️ NO se pudieron borrar hasta ahora, y eso es lo que hay que recordar: no
-- basta con que estén vacías. Tenían dos amarras vivas que se soltaron primero:
--   · `evento_participantes.pago_id` → FK a `pagos` (columna sin usar, 0 filas
--     con valor, ningún archivo del código la leía).
--   · Dos pantallas seguían leyéndolas — el dashboard sencillo y `/agente` —,
--     y como la tabla estaba vacía **sumaban $0 sin fallar**: un marcador que
--     decía "Conciliado este mes: $0" y un agente que respondía con cifras en
--     blanco. Ese es el fallo callado que justifica borrar en vez de dejar
--     tablas muertas "por si acaso". Ambas ya salen de los RPCs de Siigo.

alter table public.evento_participantes drop column if exists pago_id;

-- El orden importa: `asignaciones_pago` referencia a `pagos`.
drop table if exists public.asignaciones_pago;
drop table if exists public.abonos;
drop table if exists public.pagos;
