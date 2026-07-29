# MEMORIA del proyecto — Centro de Control CDAF

Plataforma de gestión + CRM del **Centro Deportivo Alejandro Falla** (club de tenis/pádel, Colombia).
Cliente: Laura Salazar (Vena Digital). Trabaja en **español**, de forma iterativa (revisa en local y pide
ajustes uno a uno). Explicarle lo técnico en lenguaje simple, con ejemplos; preguntar antes de decidir
temas de producto; **verificar cifras contra datos reales antes de afirmar**.

## Stack
Next.js 16 (App Router, Turbopack) · React 19 · TS · Tailwind v4 · shadcn **base-nova sobre Base UI
(NO Radix)** · Supabase (Postgres + RLS + Storage, proyecto `rxkfgbxdxhrirsscvfwe`) · Resend (correos
branded) · OpenAI (agente) · Integraciones: **Siigo** (ERP, dinero) y **EasyCancha** (reservas).

## Comandos
| Qué | Cómo |
|---|---|
| Dev server | `nohup npm run dev > /tmp/cdaf-dev.log 2>&1 & disown` (localhost:3000; log en /tmp/cdaf-dev.log) |
| Build (verificar SIEMPRE antes de commit) | `npm run build` (si falla por Google Fonts, reintentar) |
| **Migraciones** | `npm run db:apply` (Management API/HTTPS con PAT en .env). ⚠️ `db:push` NO sirve desde el agente (Postgres directo es IPv6-only) |
| Sync facturas Siigo (manual) | `npm run sync:siigo` (`--full` reimporta desde 2026-06-01) |
| Backfill cédulas por nombre | `npm run match:siigo -- --apply` |
| Sync clientes EasyCancha | `npm run sync:clientes` (nuevos entran ya con cédula/tipo/nacimiento) |
| Backfill documentos EasyCancha | `npm run sync:documentos` (simulacro; `-- --apply` para escribir). Rellena SOLO vacíos de fichas viejas |
| Redeploy Edge Function siigo-sync | `node --env-file=.env scripts/deploy-siigo-fn.mjs`; re-agendar cron: `scripts/schedule-siigo-cron.mjs` |
| Verificar esquema/datos | script one-off con Management API (`POST /v1/projects/$REF/database/query`, token de .env) o service-role |

> **Turbopack "stale"**: si el dev tira `require is not defined` en un chunk de `node_modules_*.js` con el badge **(stale)**, es caché corrupta de Turbopack, NO código (verificar: `grep -rn "require(" src/` vacío + `npm run build` pasa). Fix: `pkill -f "next dev"` + `rm -rf .next` + relanzar dev.

## Reglas duras
1. **Migraciones**: escribir SQL en `supabase/migrations/` + actualizar `src/lib/database.types.ts` A MANO
   (es manual, no generado) + `npm run db:apply` + verificar por API. Nunca asumir aplicada sin verificar.
2. **PostgREST corta a 1000 filas**: NUNCA traer facturas/filas masivas y agregarlas en JS. Toda
   suma/agrupación va en **RPCs SQL** (ya existen: `siigo_recaudo`, `siigo_ingreso_diario`,
   `siigo_top_clientes`, `siigo_ingreso_servicio`, `siigo_cartera`, `siigo_resumen_cliente`).
   ⚠️ `siigo_recaudo`, `siigo_ingreso_diario`, `siigo_facturado_diario` y `siigo_facturado_servicio`
   tienen un 3er parámetro **`p_excluir_eventos` (default false)**: SOLO el dashboard lo pasa en
   `true`, para que un torneo aporte su utilidad neta y no su bruto. Con el default, `/ingresos`,
   `/cartera`, `/reportes` y la **liquidación** (comisión de alto rendimiento vía
   `siigo_ingreso_servicio`, que NO se tocó) siguen viendo el 100% y cuadrando con Siigo.
   Al agregar parámetros hay que **DROP + CREATE**: dejar las dos firmas vuelve ambigua la llamada.
3. **Siigo manda para el dinero** (ingresos/pagos/deuda = facturas de Siigo; deuda = `saldo`).
   El cálculo interno viejo de saldos ya no se usa. **NIT de Siigo = cédula** del cliente.
4. **Secretos solo en `.env`** (gitignored): service_role, OpenAI, Resend, EasyCancha, Siigo
   (`SIIGO_USERNAME`/`SIIGO_ACCESS_KEY`), `SUPABASE_ACCESS_TOKEN` (PAT), `SYNC_SECRET`. Nunca al repo
   ni NEXT_PUBLIC. Server-side only.
5. **Diseño**: sistema guardado en `.interface-design/system.md` (leerlo antes de tocar UI). Lima
   `#d4e157` solo acción/estado/acento; sombras suaves; Montserrat headings / Open Sans cuerpo;
   números `tabular-nums`. `Input` requiere strings; selects nativos con clase `border-input bg-background h-9…`.
6. **Git**: trabajar en `main`, commit al terminar cada bloque verificado + push. Mensajes en español
   con firma `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
7. Next 16 tiene breaking changes: ante dudas de API, leer `node_modules/next/dist/docs/`.
8. `tsconfig` excluye `supabase/functions/` (código Deno; no lo toca el typecheck de Next).
9. **Nunca leer `public.profiles` directo para listar compañeros**: `profiles_select` (0001) solo deja
   ver el propio perfil salvo a SA/CA, así que a recepción/coord. deportivo/profesor los selectores
   les salen VACÍOS y los nombres como "—". Usar los helpers de **`src/lib/staff.ts`**
   (`profesoresActivos` para elegir · `profesoresParaFiltrar` para filtros históricos, incluye
   inactivos · `mapaNombresStaff`/`nombreStaff` para nombres de registros viejos · `staffDirectorio`
   para el @ de notas), que pasan por el RPC **`staff_directorio(p_solo_activos, p_role)`**
   (SECURITY DEFINER; devuelve solo id/nombre/rol/activo, nunca documento ni teléfono. Migración
   0046). Excepción legítima: `/empleados`, `/liquidacion` y `/agente`, que son solo SA/CA y sí
   necesitan los datos completos.

## Datos (dominios → tablas)
- **Clientes/CRM**: `clientes` (deportes[], documento=cédula + `tipo_documento` CC/TI/CE/PP/NIT,
  `fecha_nacimiento`; documento/tipo/nacimiento vienen de EasyCancha `userFoidNumber`/`userFoidType`/
  `userBirthDate`, cruce por correo, ver `documentoDeBooking()` en easycancha/client.ts), `acudientes`,
  `cliente_documentos` (Storage). Ficha: situación financiera = `siigo_resumen_cliente(id)`.
- **Operación**: `academias`, `inscripciones` (dias[]), `clases` (tipo academia|individual,
  valor_facturado), `asistencias` (estado: presente/ausente/excusa_medica/reposicion),
  `paquetes_catalogo`, `paquetes_cliente` (inicia_el/vence_el), `eventos` + `evento_participantes`
  + `evento_profesores` (eventos NO crean pagos; su ingreso = facturas Siigo con evento_id).
- **P&G de eventos** (migraciones 0048–0049): `evento_gastos` (concepto, categoria
  refrigerios|premios|logistica|publicidad|arbitraje|staff_externo|otro, monto, proveedor, fecha,
  `soporte_path` en bucket **`evento-docs`**). Costo del evento = gastos **+ `evento_profesores.pago`**
  (se toma automático: registrarlo también como gasto lo contaría DOBLE). Utilidad = facturado − costo.
  **Cierre**: `eventos.cerrado_el/cerrado_por` + snapshot **congelado** `cierre_ingreso/cierre_costo/
  cierre_utilidad`. Se congela para que una factura tardía o un gasto corregido no muevan un mes ya
  publicado; para corregir hay que **reabrir** (solo SA, queda en audit_log). Con el evento cerrado
  no se puede editar gastos/participantes/profes ni atarle facturas desde `/pagos`.
  RPCs: `eventos_pyg(p_evento default null)` (P&G de uno o de todos, una sola llamada para el
  listado), `eventos_resultado_periodo(desde,hasta)` (utilidad congelada de los CERRADOS, con su
  fecha), `eventos_retenido(desde,hasta)` (bruto de los ABIERTOS que cae en el periodo → el aviso).
  ⚠️ **Atar facturas NO se hace (solo) desde `/pagos`** (migración 0050). La cola de `/pagos` lista
  únicamente las `pendiente`, pero una factura de torneo casi nunca llega ahí: si el NIT empareja con
  un cliente conocido el sync la marca **`auto`**, y si el pago es anónimo la marca **`mostrador`** —
  ninguna de las dos aparece en la cola. Medido en jun–jul 2026: de 42 facturas con línea de torneo,
  38 mostrador + 3 auto + 1 pendiente → el **98% del dinero de torneos nunca pasaba por un sitio donde
  atarlo**, así que el P&G salía sin ingresos (solo costos = pérdida) y el dashboard seguía contando el
  bruto. Fondo del asunto: *¿de quién es esta plata?* (`cliente_id`, conciliación) y *¿de cuál torneo
  es?* (`evento_id`) son preguntas distintas y el único botón para la segunda vivía dentro de la
  pantalla de la primera. Solución: **`evento_facturas_candidatas(p_evento)`** (mismo servicio, ±15
  días, `evento_id is null`, **sin filtrar por estado_conciliacion**; trae `n_candidatas`/
  `monto_candidatas` por window function para que el aviso sea exacto pese al `limit 200`) + selector
  en la ficha del evento (`facturas-evento.tsx`) con acciones `atarFacturas`/`soltarFactura`. **Atar no
  concilia**: `estado_conciliacion` y `cliente_id` se dejan intactos (una mostrador sigue anónima).
  Al cerrar, si quedan candidatas sueltas se avisa para no publicar el torneo con el ingreso corto.
- 💡 **El evento se mide por CONTRIBUCIÓN, no por inscripción pura** (decisión de Laura, jul-2026, y
  está zanjada — no reproponer partir por línea). La mitad de las facturas de torneo son **canastas
  mixtas** (21 de 42: inscripción + cafetería + almacén en el mismo documento; ej. FV-4-15577 = $90.000
  de TORNEO PADEL + $65.500 de agua, café, banano y gorra). Se ata la factura **COMPLETA** porque *si no
  hubiera torneo esa persona no habría estado en el club consumiendo*: el consumo durante el evento es
  plata que el evento generó. Por eso `evento_id` vive en `siigo_facturas` y NO en
  `siigo_factura_lineas`. Consecuencias a tener presentes al leer cifras: (a) la tajada de
  Cafetería/Almacén del dashboard se achica —esa plata pasa a la utilidad del evento—, el total del
  club NO cambia; (b) el margen del torneo sale **optimista**, porque entra la venta de cafetería a
  precio lleno pero su costo de mercancía no está en `evento_gastos` (registrarlo ahí si se quiere el
  margen fino). `monto_evento` del RPC es solo informativo (columna "Inscripción"), no parte la plata.
  `evento_facturas_candidatas(p_evento, p_solo_servicio default true)`: en **false** trae TODO lo
  facturado en la ventana (≈195 facturas / $21M en un fin de semana) para el asistente que vino al
  torneo y solo consumió; va como opción (`?todas=1`), nunca por defecto. El aviso del cierre usa
  siempre el conteo **estricto**, si no en modo ampliado sería falsa alarma.
  ⚠️ Un **centro de costos de Siigo no sirve para esto**: se marca en la factura completa, así que a
  la canasta mixta le pondría "Torneos" con banano incluido — es MÁS GRUESO que el grupo de producto,
  que ya distingue línea por línea. Descartado por segunda vez.
  ⚠️ **Decidido NO usar el centro de costos de Siigo**: en las facturas de venta está apagado
  (`cost_center:false` en los 3 tipos FV) y aun prendido diría "es de torneos" pero no **de cuál**
  torneo. `evento_id` sí lo distingue. En compras (FC) sí está activo, pero se decidió capturar los
  gastos a mano y no importar las ~600 compras.
- **Dinero (Siigo)**: `siigo_facturas` (siigo_id único, total, saldo=deuda, cliente_id, evento_id,
  estado_conciliacion: auto|pendiente|mostrador|conciliada), `siigo_factura_lineas` (servicio_id, monto),
  `siigo_productos` (caché código→grupo→servicio), `siigo_sync` (cursor). Catálogo `servicios`
  (clave, color, categoria_saldo, siigo_grupo ↔ account_group de Siigo).
- **Nómina**: modelo de **reglas por entrenador** `profesor_regla` (nombre + concepto
  {clase_particular|paquete|academia|siigo|**clase**(comodín)|**salario**} + metodo {pct_facturado|
  fijo_por_clase|escalonado_asistentes|por_alumno|pct_siigo_servicio|**salario_fijo**|**comision_umbral**} +
  pct/valor/servicio_id/escalones/**umbral** + **filtro dias[]/hora_desde/hora_hasta**). `comision_umbral` =
  el fijo cubre las primeras `umbral` clases del mes y desde la (umbral+1) paga pct% del facturado, contando
  el **acumulado del mes** (Sebastián: 140 clases, luego 30%). Liquidación en
  `src/lib/liquidacion.ts` con **convivencia**: si el profe tiene reglas → se liquida por reglas; si no →
  modelo viejo `profesor_compensacion` (por_clase | fijo_comision | fisico) INTACTO. `clases.num_asistentes`
  (capturado al cerrar una particular en `/cierre`) alimenta el escalón. Alto rendimiento = % de
  `siigo_ingreso_servicio` del periodo. `salario_fijo`.valor = MENSUAL (prorrateado ×quincenas/2). El filtro
  día/hora hace que una regla de clase aplique solo a clases que inician en ese rango/días (ej. Willington:
  comisión 50% solo lun–sáb 07:00–08:00).
  ⚠️ **El concepto exacto le gana al comodín `clase`, sin importar el `orden`** (liquidacion.ts, dos
  `find` en cascada). Antes ganaba el primero por `orden`: como `clase` casa con TODO, una "Comisión
  50% de las clases de 7 a.m." le tapaba a la regla de academia solo por estar más arriba, y pagaba
  $60.000 donde van $0. Verificado con las reglas reales de Esteban: con el blindaje la academia paga
  $0 aunque la regla esté al final de la lista, y la clase particular de 7 a.m. sigue pagando 50%.
  ⚠️ Esteban y Jorge dan academia con **salario fijo**: tienen regla explícita `academia` /
  `fijo_por_clase` en **$0** llamada "Academia · cubierta por salario fijo" (ids 25 y 26, insertadas a
  mano en la BD, no en migración). No cambia el pago —ya era $0 por no casar ninguna regla— pero la
  liquidación ahora dice POR QUÉ: antes "$0 porque va en su salario" y "$0 porque falta configurar la
  regla" se veían idénticos, así que un olvido era invisible. Regla general: **todo el que dé academia
  necesita regla de academia, aunque sea en $0.** **TODOS los entrenadores activos están migrados** al modelo de
  reglas (Leo, Joaquín, Dairon, Cristian, Willington, Esteban, Sebastián, Jorge); nadie usa ya el modelo
  viejo, pero `profesor_compensacion`/`profesor_valor_clase` quedan como respaldo/tumba. **Pickers de
  profesor filtran por `activo`** (clases/eventos/academias). Esteban tiene comisión 50% en 2 franjas
  (07:00 y 13:00, lun–sáb) = 2 reglas.
- **EasyCancha ↔ profesor**: el courtName ("Profesor Willinton - Cancha 3") da el profe del calendario
  vía `claveProfesor()` (normaliza sin prefijo/acentos) + tabla `easycancha_profesor_alias` (clave→perfil)
  para unificar duplicados (Willington estaba 2 veces: "Profesor" y "Entrenador"). Materializar reserva =
  se elige el perfil a mano (solo activos).
- **Bloqueos de academia (EasyCancha)**: el club se auto-reserva las canchas de academia con el usuario
  **"BLOQUEOS ACADEMIAS"** (correo `agentecdaf@gmail.com`, userId 1759452). El correo es el criterio
  confiable → `esBloqueoAcademia()` en easycancha/client.ts (jun–jul 2026: las 529 reservas con ese correo
  son de ese usuario y ningún bloqueo llegó con otro correo). ⚠️ `bookedBy:"club"` NO sirve: sale así
  también cuando recepción reserva a nombre de un cliente (2.269 de 2.529). El campo **`comments`** de la
  API sí existe y ya se lee, pero **solo se muestra en los bloqueos de academia**: en las reservas de
  clientes esa nota trae datos privados ("PAGA LA PRIMERA SEMANA DE MAYO", "…pagadas por Peter Lemus").
  ⚠️ Datos duros antes de apoyarse en él: viene lleno en **14 de 529 bloqueos (2,6%)** y no siempre es el
  profesor ("ACADEMIA CON WILLY" sí; "Alicia Londoño", "esta mojada porque limpiaron los vidrios" no).
  El `courtName` de estos bloqueos es "Cancha N" pelado → `profesorDeCancha()` da null.
  ⚠️ **Un bloqueo ≠ una clase**: el 77% dura ≥2h (hay de 6,5h) y adentro caben varios grupos seguidos;
  la academia se paga `fijo_por_clase` (Joaquín $100k, Leo $90k, Cristian apoyo $35k), así que meter un
  bloque de 4h como UNA clase paga de menos. 30% de los bloqueos se cancela o permuta.
  💡 Y un bloque largo NO es "una academia repetida": son academias **distintas** seguidas (martes
  15:00–18:00 en Cancha 3 = Bola Roja + Bola Verde + Bola Amarilla). Por eso el modal propone
  **`academiasEnBloque()`** (types.ts): cruza día de la semana + solapamiento de horas + deporte, y
  recorta el horario de cada clase al bloque. **La cancha NO filtra, solo marca** (`mismaCancha`):
  exigirla dejaba fuera 19 de 22 bloques de julio porque las academias de la mañana están configuradas
  en Cancha 4 y el club bloquea la Cancha 1. Vienen marcadas solo las que coinciden en cancha; las de
  otra cancha se muestran sin marcar (si no, el mismo horario bloqueado en 2 canchas crearía la clase
  dos veces). Sin candidatas → modo manual (escoger academia + en cuántas clases partir el bloque).
- **Registrar un bloqueo como clase(s)**: botón **Academia** en el modal de `/clases`
  (`asignar-paquete.tsx` → `materializarAcademia`). En un bloqueo se muestra SOLO ese botón: paquete/
  particular crearían un "cliente" llamado BLOQUEOS ACADEMIAS. Las clases entran sin `cliente_id`
  (el cobro sale de la asistencia) y con el profesor de cada academia, con override opcional para todas.
  ⚠️ Migración **0052**: `clases_ec_booking_uidx` (ÚNICO) → `clases_ec_booking_idx` (normal), porque un
  bloqueo puede generar N clases. La deduplicación del calendario ya era por "existe alguna clase con
  este booking", no por unicidad.
- **Notas (relevo de turno)**: `notas` (texto, autor_id, prioridad normal|alta, estado
  pendiente|resuelta, `para_todos`, enganche opcional a cliente_id/clase_id/evento_id) +
  `nota_destinatarios` (nota_id + perfil_id + `leida_el`). Etiquetar con **@** = asignar responsable;
  **sin etiquetar = tablón general** y se reparte a todo el staff activo menos el autor. `leida_el`
  alimenta el contador de la campanita (leer ≠ resolver). Lectura por RPC **`notas_listar`**
  (filtros mias|todas|resueltas|**sin_leer**, o por cliente) porque agrega destinatarios en jsonb y
  resuelve nombres. Aviso en vivo por **Realtime** sobre `nota_destinatarios` filtrado por perfil.
  **"Para mí" = pendientes + cualquier nota sin abrir** (aunque esté resuelta), y la campanita usa
  `sin_leer`: si no, un comentario en una nota resuelta encendía el contador y la pestaña salía vacía.
- **Comentarios de nota** (`nota_comentarios`): hilo plegado dentro del post-it, la tarjeta solo
  muestra el contador (`notas_listar.n_comentarios`) y el hilo se pide al desplegar
  (`nota_comentarios_listar`). Se comenta por el RPC **`nota_comentar`** (SECURITY DEFINER, porque
  `nota_dest_insert` solo deja etiquetar al autor de la nota): guarda el texto y **vuelve a poner
  `leida_el = null`** para los involucrados = autor + quienes ya comentaron + etiquetados con @ en el
  comentario + los responsables de la nota **solo si NO es `para_todos`** (un comentario en el tablón
  general no re-avisa a los 9). Comentar una nota resuelta NO la reabre. Migración 0047.
  UI en `notas/` (`mencion-textarea`, `nota-composer`, `nota-card`, `nota-comentarios`,
  `nota-rapida`) + campanita en `app-shell/notas-campana.tsx`. Migraciones 0044–0045, 0047.
- ⚠️ **Fechas en componentes de cliente**: usar `fechaHoraCorta`/`tiempoRelativo` de
  **`src/lib/fecha.ts`**, NUNCA `Intl.DateTimeFormat("es-CO")` en algo que se renderice en servidor
  y navegador: el español mete un espacio fino (U+202F) antes de "p. m." en Node pero no siempre en
  el navegador, React lo lee como texto distinto y **descarta la hidratación del árbol entero**
  (la pantalla deja de pintar). El helper arma el texto a mano desde `formatToParts`.
- **Tablas en desuso** (persisten, no borrar aún): `pagos`, `asignaciones_pago`, `abonos`,
  `profesor_valor_clase`.

## Sincronización Siigo (automática)
Edge Function **`siigo-sync`** (fuente: `supabase/functions/siigo-sync/index.ts`, misma lógica que el
CLI — mantener ambas en sintonía). pg_cron la invoca: **cada 20 min** (incremental) y **08:15 UTC =
03:15 Bogotá** (refresh de saldos desde jun). Protegida con header `x-sync-secret`. Salud: consultar
`cron.job_run_details` y `net._http_response`. La UI muestra "última sync" desde `siigo_sync.updated_at`.

## Módulos (rutas → fuente)
`/dashboard` bento animado (RPCs Siigo + EasyCancha semanal; componentes en `dashboard/`: count-up,
chart-area, chart-barras-semana, chart-donut, radial-gauge) · `/ingresos` y `/cartera` detalle paginado
(20/pág, filtro por servicio; ingresos también por periodo) · `/pagos` cola de conciliación (SOLO
asignar cliente por NIT; "mostrador" no aparece. **Atar a un evento NO se hace aquí** — ver P&G de
eventos) · `/clientes` (paginado 30, autocomplete) · `/academias`
· `/paquetes` · `/eventos` (P&G por evento + cierre + atar sus facturas; el dashboard solo ve la
utilidad de los cerrados y avisa cuánto hay retenido en los abiertos) · `/clases` (calendario; academia = morado #8b7cf6) · `/cierre` (solo fecha ≤
hoy; academia: asistencia por estado) · `/liquidacion` (facturado vs a pagar; periodo mes/q1/q2) ·
`/empleados` (compensación) · `/config` (catálogo de servicios) · `/reportes` · `/agente` (aún lee
modelo viejo — pendiente repuntar a Siigo) · `/notas` bandeja de recados del staff (ver abajo).

## Contexto de negocio (decisiones de Laura)
- Conciliación manual = solo deudas + facturas con cliente identificado; el mostrador anónimo queda
  cerrado como ingreso (pero siempre conciliable a mano). Conciliar una factura ata TODAS las del mismo
  NIT y guarda la cédula (auto-match futuro).
- Facturas "canasta mixta": se desglosan por línea; categoría = grupo del producto (18 grupos Siigo ↔
  catálogo `servicios`, match con trim/lowercase — ojo espacios finales en Siigo).
- Academia: cobro por sesión asistida (excusa médica no se cobra) + matrícula UNA por deporte, SEMESTRAL.
- Historia de datos arranca el **1-jun-2026**: comparativas "Mes vs anterior" serán completas desde agosto.

## 🔄 Rediseño de Academias (decidido con el club el 29-jul-2026, AÚN NO construido)
El modelo actual de `academias` mezcla tres cosas y por eso se llenó de "grupitos" (Esteban tenía 11
academias, Jorge 9, para lo que en realidad son 2 servicios). Lo decidido:
- **4 academias fijas**: Recreativa/Competencia × tenis/pádel. Cada una apunta a su **servicio de
  Siigo** (`Academia de Tenis`, `Alto rendimiento tenis`, `Academia de Padel`, `Academia Alto
  Rendimiento Padel`) — no a un precio interno.
- **NO existe entidad "grupo"**. Decisión de Laura: mostrarlo confunde. Lo que se guarda es la lista
  de inscritos de cada academia, y por inscrito sus **horarios por día** (día, hora, duración,
  profesor, cancha) + nivel. El "grupo" es un cálculo invisible (agrupar por día+hora+profesor), usado
  solo para pre-marcar la asistencia y para el reporte de ocupación.
- **Inscripción única por niño y por deporte** (un niño no está en recreativa y competencia a la vez;
  sí puede hacer tenis y pádel). El alumno es un **`cliente_miembros`**, no la ficha familiar.
- **Nivel** = progresión de tenis (Bola Roja/Naranja/Verde/Amarilla) + Principiantes/Iniciados/
  Intermedio, en lista cerrada (si cada uno escribe libre, el reporte por nivel no sirve).
- **`precio`/`matricula` dejan de ser cálculo** (la plata sale de Siigo). Se quita la columna
  "Facturado" inventada de la liquidación para academia (era `precio ÷ (días×4) × alumnos`). Verificado:
  las 3 reglas de academia son `fijo_por_clase` y NO usan el facturado → impacto $0. Control correcto
  = cruzar **quién asistió** vs **a quién le facturó Siigo**, por personas, no por precio.
- **El club deja de hacer bloqueos largos**: una reserva de EasyCancha = una clase (instrucción de
  Laura al club, jul-2026). El usuario BLOQUEOS ACADEMIAS es EXCLUSIVO de academias.
- **Formato del comentario**: "Academia Recreativa Esteban". ⚠️ Pero **no se depende de él**: en el
  modal la academia se escoge SIEMPRE a mano (arranca vacía, sin pre-seleccionar) porque define a
  quién se le cobra; el **profesor** sí viene sugerido del comentario y se **confirma al cerrar la
  clase** (obligatorio: hoy una clase sin `profesor_id` desaparece de la liquidación en silencio).
- **Cierre**: los inscritos esperados a esa hora llegan **pre-marcados** y visualmente distintos, los
  demás inscritos abajo (reposiciones), y antes de cerrar un conteo explícito ("6 presentes de 8
  inscritos") para que un olvido salte a la vista. Nada se guarda hasta confirmar.
- **Se quita** "Generar / regenerar programación" y el reprogramar/cancelar de `/academias`.
- Las 11 academias actuales NO se migran (tenían 1 sola inscripción): se archivan y se arranca desde
  un Excel que llena el club (una fila por niño y por día).

## Pendientes conocidos
- Rotar tokens expuestos en chat: PAT de Supabase y access_key de Siigo (Laura debe regenerarlos).
- D3 · catálogo estándar de paquetes (Laura levanta info con el centro).
- Agente IA → leer ingresos de Siigo (aún consulta `pagos` viejo).
- Retirar tablas en desuso cuando se confirme estabilidad.
