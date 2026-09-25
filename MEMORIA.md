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
| **Pruebas (verificar SIEMPRE antes de commit)** | `npm test` — incluye `tests/academias-render.test.tsx` y `tests/eventos-render.test.tsx`, que RENDERIZAN las páginas de verdad. ⚠️ **El build NO sustituye a esto**: ver abajo |
| **Migraciones** | `npm run db:apply` (Management API/HTTPS con PAT en .env). ⚠️ `db:push` NO sirve desde el agente (Postgres directo es IPv6-only) |
| Sync facturas Siigo (manual) | `npm run sync:siigo` (`--full` reimporta desde 2026-06-01) |
| **Refrescar solo el catálogo de productos** | `npm run sync:productos` (`-- --dry` para simulacro). Úsalo cuando el club renombre un grupo en Siigo: el sync completo solo refresca este caché si encuentra facturas nuevas, y con el rezago de ~1 día puede pasar medio día sin hacerlo |
| **Importar el planeador de academias** | `npm run import:planeador -- "ruta/PLANEADOR BASE.xlsx"` (simulacro; `--apply` para escribir). Lee la hoja **BASE DE DATOS**, NO las rejillas por profesor |
| **Importar el horario de pádel** | `npm run import:padel -- "ruta/HORARIO ACADEMIA DE PADEL LEO.xlsx"` (simulacro; `--apply`). Otro formato (una rejilla); cada importador toca SOLO su deporte |
| Backfill cédulas por nombre | `npm run match:siigo -- --apply` |
| Sync clientes EasyCancha | `npm run sync:clientes` (nuevos entran ya con cédula/tipo/nacimiento) |
| Backfill documentos EasyCancha | `npm run sync:documentos` (simulacro; `-- --apply` para escribir). Rellena SOLO vacíos de fichas viejas |
| Redeploy Edge Function siigo-sync | `node --env-file=.env scripts/deploy-siigo-fn.mjs`; re-agendar cron: `scripts/schedule-siigo-cron.mjs` |
| Redeploy tarea que borra fotos de turno | `npm run deploy:turnos-fn`; re-agendar cron: `npm run cron:turnos` |
| Verificar esquema/datos | script one-off con Management API (`POST /v1/projects/$REF/database/query`, token de .env) o service-role |

> ⚠️ **`npm run build` en verde NO significa que la página abra.** El 25-ago-2026 `/academias/[id]`
> cayó en producción con "This page couldn't load": una función leía una `const` declarada veinte
> líneas más abajo → `ReferenceError: Cannot access 'X' before initialization` en CADA render.
> No lo vio NADIE: `tsc` no lo ve porque la lectura ocurre dentro de una función; `next build` no lo
> ve porque las páginas son dinámicas y no se renderizan al compilar; y pedir la URL con `curl` solo
> llega al **307 hacia /login**, así que el componente ni se ejecuta — un 500 y un redirect se ven
> igual desde fuera. Por eso existe **`tests/academias-render.test.tsx`**: monta las páginas con
> `renderToStaticMarkup`, saltándose el guardia de sesión (`vi.mock` de `@/lib/auth`) y usando
> service_role. Verificado que caza la regresión: con el bug puesto, 2 pruebas fallan con ese mismo
> ReferenceError. **Al tocar una pantalla, agregarle su render aquí.**
> ⚠️ Efecto secundario al leer ese HTML: `staff_directorio` exige `auth.uid()`, así que con
> service_role los nombres del staff salen vacíos y todo aparece como "sin profesor". Es del arnés,
> no de la app (verificado simulando sesión: devuelve los 17).

> **Turbopack "stale"**: si el dev tira `require is not defined` en un chunk de `node_modules_*.js` con el badge **(stale)**, es caché corrupta de Turbopack, NO código (verificar: `grep -rn "require(" src/` vacío + `npm run build` pasa). Fix: `pkill -f "next dev"` + `rm -rf .next` + relanzar dev.

## 🚀 Despliegue (Vercel)
**Producción: https://alejandrofallacd.com** (+ `www.`). Proyecto `centro-de-control` del equipo
`centro-deportivo-alejandro-falla`, **plan Pro desde el 14-sep-2026** (antes Hobby).
- **Es automático: `git push` a `main` = despliegue a producción.** No hay comando, ni CLI de Vercel,
  ni token en `.env`. El agente llega hasta el push; Vercel construye al ver el commit (~40-60 s).
  Por eso "desplegar" no es una acción aparte: si el push está hecho, ya está en camino.
- Verificar que entró: `curl -o /dev/null -w "%{http_code}" https://alejandrofallacd.com/login` → 200,
  y en el panel de Vercel el último *Deployment* debe decir **Ready** con el hash del commit.
- ⚠️ **La URL `centro-control-cdaf.vercel.app` YA NO EXISTE** (404 `DEPLOYMENT_NOT_FOUND`): es de
  julio-2026, antes de renombrar el proyecto. Aparece en transcripciones viejas y llevó a diagnosticar
  "producción caída" cuando estaba perfecta. Usar siempre el dominio propio.

## Reglas duras
1. **Migraciones**: escribir SQL en `supabase/migrations/` + actualizar `src/lib/database.types.ts` A MANO
   (es manual, no generado) + `npm run db:apply` + verificar por API. Nunca asumir aplicada sin verificar.
   ⚠️ **La versión sale del NOMBRE del archivo, y si se repite la migración NO CORRE — en silencio.**
   `db-apply` compara el prefijo contra `supabase_migrations.schema_migrations`, así que un archivo
   nuevo con una versión ya usada se da por aplicado y dice "✅ No hay migraciones pendientes" sin
   ejecutar nada. Pasó el 24-ago-2026: un `20260609120060_academia_grupos.sql` chocó con
   `20260609120060_perfil_y_acceso.sql` y las tablas nunca se crearon; el mensaje de éxito no lo
   delató. **Antes de nombrar una migración: `ls supabase/migrations/ | tail -3`** y usar una versión
   posterior a la última. Y siempre verificar por API que el objeto exista (`to_regclass`), no confiar
   en el "ok" del script.
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
   ⚠️ **Subir archivos: el tope real lo pone Next, no nuestro código.** Todo lo que se sube en esta
   app (foto de perfil, contratos, documentos de cliente, soportes de gasto, Excel de importación)
   viaja por una **Server Action**, y Next las corta en **1 MB por defecto** — el archivo se rechaza
   antes de llegar a validarse, así que los `if (size > 10MB)` del código eran decorativos. Está
   subido a **12 MB** en `experimental.serverActions.bodySizeLimit` (next.config.ts) para que quepan
   de verdad los 10 MB que prometen los documentos. **Al subir el tope de algo, hay que revisar los
   dos sitios.** Se confirma que quedó activo porque `next dev` imprime "Experiments · serverActions".
   Los buckets de Storage no estorban: ninguno tiene `file_size_limit` propio (usan el global del
   proyecto).
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
- 📝 **Crear y editar la ficha usan UN SOLO formulario** (`clientes/cliente-form.tsx`, 24-sep-2026).
  Eran dos copias y la de crear se quedó sin el bloque de **Facturación** y sin la casilla de "mismos
  datos": recepción tenía que guardar, volver a entrar a Editar y llenarlos ahí (video del club,
  23-sep-2026). Sin `cliente` = crear. `createCliente` ya guarda los campos de facturación, valida
  que el NIT no sea de otro cliente (`choqueNitFacturacion`, compartido con editar, y ANTES de crear el
  acudiente para no dejarlo huérfano) y ata las facturas libres de ese NIT (`reatribuirFacturas`).
  · La casilla **va en el bloque del ACUDIENTE y copia el CONTACTO DE EMERGENCIA** (antes vivía en la
    emergencia y copiaba al revés, aunque el acudiente sale DESPUÉS en el formulario). Así lo pidió
    Laura: se llena la emergencia y el acudiente la toma. Copia nombre, teléfono y parentesco; el
    **documento del acudiente se escribe aparte** porque la emergencia no lo tiene. El bloque del
    acudiente sale apenas la fecha de nacimiento dice menor, y va justo debajo de la emergencia.
  · Prueba: `tests/clientes-form.test.tsx`.
- 👤 **El nombre del deportista NUNCA se lee de `clientes`** (ago-2026, `src/lib/deportistas.ts`).
  El **profesor** no tiene el módulo de clientes y `clientes_select` lo excluye, así que esa consulta
  con su sesión devuelve **0 filas sin error** (medido: ve 0 de 320 en `clientes` y 276 en
  `cliente_miembros`) → el calendario y la cola de `/cierre` le salían con "—" en TODAS las clases
  particulares. Se lee de `cliente_miembros`, que sí lo incluye desde 0033 justo porque el roster de
  cierre depende de ella. De paso queda bien el caso de hermanos: con `miembro_id` se muestra quien
  tomó la clase, no el titular de la ficha. Mismo patrón que `staff.ts` con `profiles` (regla 9).
  ⚠️ Lo mismo mordía el **correo de confirmación** del cierre: el correo solo vive en `clientes`, así
  que al cerrar un profesor la familia no recibía nada, en silencio. Esa lectura puntual va con
  `createAdminClient()` (el permiso ya se validó arriba y no sale a pantalla).
- 🔒 **Toda ficha nace con su fila de titular** — lo hace el trigger `clientes_crear_titular`
  (migración 0066), NO el código. La operación (asistencia, paquetes, inscripciones) cuelga del
  MIEMBRO, así que una ficha sin titular sale como **"Sin deportista"** al cerrar la clase. Ya se
  arregló "en el código" una vez (0040, tres fugas) y la fuga volvió a abrirse por una **cuarta
  puerta**: `sincronizarClientesEC` (el botón de sincronizar EasyCancha DENTRO de la app) inserta en
  lote y nunca creó el miembro → 48 de 320 fichas rotas, que cuadran exactas con sus tres corridas
  del audit_log (27+10+11). Hay **cinco sitios** que crean fichas (formulario, las dos sincros de
  EasyCancha, importador de CSV y `import-easycancha.mjs`) y basta que uno lo olvide; y el fallo es
  invisible hasta semanas después, porque la ficha se ve perfecta en `/clientes`. Por eso la
  invariante la hace cumplir la base. 0066 trae también el trigger de UPDATE que mantiene el espejo
  al día (la ficha manda), que es lo que 0040 tuvo que corregir a mano tras los backfills.
  **Al crear una ficha desde código nuevo: no insertar el titular, ya está.**
- **Operación**: `academias`, `inscripciones` (dias[]), `clases` (tipo academia|individual,
  valor_facturado), `asistencias` (estado: presente/ausente/excusa_medica/reposicion),
  `paquetes_catalogo`, `paquetes_cliente` (inicia_el/vence_el), `eventos` + `evento_participantes`
  + `evento_profesores` (eventos NO crean pagos; su ingreso = facturas Siigo con evento_id).
- **P&G de eventos** (migraciones 0048–0049): `evento_gastos` (concepto, categoria
  refrigerios|premios|logistica|publicidad|arbitraje|staff_externo|otro, monto, proveedor, fecha,
  `soporte_path` en bucket **`evento-docs`**). Costo del evento = gastos **+ `evento_profesores.pago`**
  (se toma automático: registrarlo también como gasto lo contaría DOBLE). Utilidad = facturado − costo.
  💡 **Un gasto puede ir en $0** (ago-2026, pedido de Laura): sirve para dejar constancia de lo que
  cubrió un PATROCINADOR, que no le cuesta nada al club pero el club quiere verlo en el detalle del
  torneo. La base ya lo aceptaba (`check (monto >= 0)`); lo impedían el validador de la acción y el
  `min={1}` del formulario.
  **Cierre**: `eventos.cerrado_el/cerrado_por` + snapshot **congelado** `cierre_ingreso/cierre_costo/
  cierre_utilidad`. Se congela para que una factura tardía o un gasto corregido no muevan un mes ya
  publicado; para corregir hay que **reabrir** (SA y coord. deportivo, queda en audit_log). Con el evento cerrado
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
  pantalla de la primera. Solución: **`evento_facturas_candidatas(p_evento)`** (mismo servicio,
  ventana **−5/+10 días**, `evento_id is null`, **sin filtrar por estado_conciliacion**; trae `n_candidatas`/
  `monto_candidatas` por window function para que el aviso sea exacto pese al `limit 200`) + selector
  en la ficha del evento (`facturas-evento.tsx`) con acciones `atarFacturas`/`soltarFactura`. **Atar no
  concilia**: `estado_conciliacion` y `cliente_id` se dejan intactos (una mostrador sigue anónima).
  Al cerrar, si quedan candidatas sueltas se avisa para no publicar el torneo con el ingreso corto.
- 💰 **Inscribir NO es haber pagado** (ago-2026). La insignia "pagado" de la lista de participantes
  salía de `monto > 0`, así que teclear el valor de la inscripción ya lo daba por cobrado. Son dos
  cosas distintas: `monto` es lo que DEBE y `estado` (inscrito|pagado|cancelado) si ya entregó. Ahora
  el formulario trae una casilla **"Ya pagó"** que arranca SIN marcar, y cada fila tiene "Marcar
  pagado / Marcar pendiente" (`cambiarPagoParticipante`) para el que paga después — sin eso, quien se
  inscribiera sin pagar se quedaba en pendiente para siempre. El título muestra "N sin pagar".
  ⚠️ Esto es **control interno del torneo** (quién entregó la plata), NO el ingreso del evento: ese
  sigue saliendo de las facturas de Siigo atadas, y `evento_participantes.monto` nunca ha alimentado
  el P&G.
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
- ⏱️ **Ventana de captura: −5/+10 días** (migración 0067; el rango vive en `VENTANA_CANDIDATAS` de
  **`src/lib/eventos.ts`** y se le PASA al RPC, para que la etiqueta de pantalla y el filtro no puedan
  desincronizarse). Era ±15 y **solapaba torneos**: las facturas llegan en ráfagas cortas (jun 2–8 ·
  jun 26–27 · jul 8–10 · jul 17–20), así que medio mes desde un torneo alcanza al anterior — al evento
  del 7-8 de agosto le proponía una factura del 23-jul, de la ráfaga del 20-jul. Asimétrico a
  propósito: se inscriben pegado a la fecha, pero las cuentas de última hora se facturan DESPUÉS.
  Efecto medido: modo ampliado de 200 (tope) a 71 facturas. `-10/+10` se descartó porque en ampliado
  vuelve a 200. ⚠️ Hoy no hay NI UNA factura de "Patrocinio torneo" (las 42 son "Torneo"), por eso
  estrechar el lado de "antes" no se lleva pagos anticipados de patrocinadores; si algún día entran,
  revisar. 💡 **El club dice que los pagos entran EL DÍA del torneo** (Laura, 5-ago-2026): por eso el
  lado de "antes" sobra con 5 días y el margen que de verdad importa es el de DESPUÉS.
  ⚠️ Queda un hueco conocido: una factura FUERA de la ventana no se puede atar desde ningún
  sitio (falta un buscador por número en la ficha). **Decisión aplazada a propósito**: se mide con el
  torneo del 7-8 de agosto de 2026 y se decide la semana del 10-ago con el comportamiento real, en vez
  de construirlo a ciegas.
  ⚠️ **Decidido NO usar el centro de costos de Siigo**: en las facturas de venta está apagado
  (`cost_center:false` en los 3 tipos FV) y aun prendido diría "es de torneos" pero no **de cuál**
  torneo. `evento_id` sí lo distingue. En compras (FC) sí está activo, pero se decidió capturar los
  gastos a mano y no importar las ~600 compras.
- ⚠️ **Renombrar un grupo de producto en Siigo rompe la categorización en silencio.** El sync casa las
  líneas por el **nombre** del grupo (`servicios.siigo_grupo` ↔ `account_group`, con trim+lowercase).
  Si allá lo renombran, esa plata entra con `servicio_id = null`: el total del club sigue cuadrando y
  solo se desinfla la tajada de ese servicio, así que nadie se entera. Pasó el **30-jul-2026**: el club
  estandarizó los cuatro grupos de academia (migración 0058) —
  `Academia de Tenis ` → `Academia recreativa tenis` · `Alto rendimiento tenis` →
  `Academia competencia tenis` · `Academia de Padel` → `Academia recreativa padel` ·
  `Academia Alto Rendimiento Padel` → `Academia competencia padel`. `Alto rendimiento Joaquin` y
  `Preparación física` NO cambiaron. Al arreglarlo se **actualizan las filas existentes**, nunca se
  crean nuevas: sus ids los referencian `siigo_factura_lineas` (293 líneas de historia),
  `academias.servicio_id` y `profesor_regla.servicio_id` (la comisión del 25% de Joaquín y Leo, que
  habría empezado a liquidar $0). Aviso permanente en **`/config`**: lista los grupos de Siigo que
  ningún servicio reclama, con su nº de productos.
- 🏫 **"Alianzas colegios" reemplazó a "Convenios colegios"** (migración `20260925100000`,
  25-sep-2026, decisión de Laura). El 22-sep el club creó en Siigo el grupo **"Alianzas colegios"**
  (ALI-001 MONTELUNA TENIS · ALI-002 MONTESSORI TENIS · ALI-003 MONTESSORI PADEL) y su primera venta
  (FV-3-18606, $4.020.000) salió como **"Sin categoría"** en el dashboard — otra vez el fallo del
  grupo nuevo o renombrado. Se actualizó el servicio 14 (clave `convenios_colegios` se conserva),
  y el producto viejo **AF683 "Convenio"** (grupo CONVENIOS COLEGIOS, **0 ventas en toda la
  historia**) se reclama por código para que no quede huérfano. ⚠️ Esa factura salió a
  **consumidor final (222222222222)**, no al NIT del colegio: queda como mostrador, sin cliente.
- 🤖 **Los grupos de Siigo se reconocen SOLOS** (migraciones `20260925110000` y `…111000`,
  25-sep-2026, pedido de Laura). El emparejamiento por NOMBRE falló dos veces en silencio (renombre
  del 30-jul, grupo nuevo del 22-sep). Ahora:
  · **`servicios.siigo_grupo_id`** = el número del grupo en Siigo, que no cambia al renombrar. Es la
    llave; `siigo_grupo` guarda el nombre actual. `siigo_productos.account_group_id` también.
  · **Una sola regla, en SQL: `siigo_catalogo_aplicar(p_productos, p_simulacro)`** (solo
    service_role). La llaman los TRES que leen el catálogo: el sync de consola, la Edge Function y
    `sync:productos` — antes cada uno tenía su copia y la de `sync:productos` ya había perdido la
    regla de los códigos de matrícula. Orden: **código → número de grupo → nombre** (respaldo).
  · **Grupo RENOMBRADO en Siigo → el servicio toma el nombre nuevo solo** (decisión de Laura: que
    cambie automático). **Grupo NUEVO con productos → se crea su servicio** (clave `siigo_<id>`,
    nombre de Siigo, **sin color** = gris por defecto hasta asignarle uno con el validador).
    No se crea si todos sus productos ya los reclama alguien por código (CONVENIOS COLEGIOS).
  · En los dos casos: rastro en `audit_log` y **nota "Aviso automático"** a los superadministradores
    activos. Para eso `notas.autor_id` ahora admite **NULL = sistema**; `notas_listar` hace LEFT JOIN
    del autor, y el candado `notas_solo_autor_edita` pasó de `<>` a `is distinct from` (con `<>`, una
    nota sin autor la habría podido editar cualquiera).
  · Además re-categoriza las líneas que entraron con `servicio_id` NULL (nunca toca las que ya tienen
    categoría: pueden traer corrección manual).
  · ⚠️ La Edge Function solo lee el catálogo cuando hay facturas nuevas (o en el refresh nocturno),
    así que un grupo nuevo se detecta cuando llega su primera venta — que es cuando importa.
  · ⚠️ Si el grupo nuevo es en realidad un servicio existente con otro nombre, la función crea uno
    aparte: unirlos es a mano (mover `siigo_grupo_id` y re-categorizar), como se hizo con Alianzas.
  · `--dry` / `p_simulacro`: la función calcula, **revierte con una excepción `SIMULACRO`** y
    devuelve el resultado en el `details`. Pruebas: `tests/siigo-catalogo.test.ts` (todo en
    simulacro). Cazó un fallo real: un producto repetido en el catálogo tumbaba el sync entero.
- **Dinero (Siigo)**: `siigo_facturas` (siigo_id único, total, saldo=deuda, cliente_id, evento_id,
  estado_conciliacion: auto|pendiente|mostrador|conciliada), `siigo_factura_lineas` (servicio_id, monto),
  `siigo_productos` (caché código→grupo→servicio), `siigo_sync` (cursor). Catálogo `servicios`
  (clave, color, categoria_saldo, siigo_grupo ↔ account_group de Siigo).
- 🎓 **Matrículas separadas de las clases de academia** (migración 0072, ago-2026). El club pidió
  leer aparte cuánto entra por MATRÍCULA. **Siigo NO lo trae separado**: verificado contra su API,
  la matrícula (`AF209`) y la mensualidad (`AF297`) comparten `account_group` (id 2008), `type`
  (Service) y `tax_classification` — ningún campo las distingue. Lo único que las separa es el
  **código de producto**, y es señal confiable en ambos sentidos (medido sobre todo el histórico):
  ninguna matrícula usa otro código (**0 fugas**) y `AF209`/`AF184` nunca se usan para otra cosa
  (sus 128 líneas dicen MATRÍCULA).
  · Por eso `servicios` aprendió a reclamar **`siigo_codigos text[]`**: el CÓDIGO le gana al GRUPO.
    Es la excepción, no la regla — el resto sigue casando por grupo. Va en el sync **en los dos
    sitios** (`servicioDeProducto()` en CLI y Edge Function).
  · **Las matrículas de competencia se cobran con los códigos de recreativa** (confirmado con el
    club): no existe producto de matrícula para competencia. Por eso las categorías son por
    DEPORTE — "Matrícula Tenis" / "Matrícula Pádel" — y cada una cubre recreativa + competencia.
    **No renombrarlas a "Matrícula Recreativa …"**, sería falso.
  · **No rompe pagos**: las únicas reglas `pct_siigo_servicio` (25% de Joaquín y Leo) apuntan a
    *Competencia Pádel*, que no tiene matrículas. Verificado antes de aplicar.
  · 💡 **La dona no necesitó un color nuevo del top-5, y eso fue suerte medida, no diseño.** Se midió
    que **NO existe un 8º color** que se despegue de los 7 que pelean el top-5 (el mejor posible da
    ΔE 14,3 en visión normal, bajo el piso de 15). Pero separadas por deporte y por mes la matrícula
    queda en **puesto 7–9 (tenis) y 13–15 (pádel)**: nunca entra al top-5, así que cae en la tajada
    gris "Otros" y su color solo se ve en el listado, donde cada fila lleva nombre y cifra. ⚠️ La
    matrícula es **semestral**: si un arranque de semestre la sube al top-5, la leyenda igual la
    nombra, pero su color puede parecerse a un vecino. Colores del validador: `#463dc3` (tenis, el
    mejor separado porque es la grande) y `#1ebdca` (pádel) — ΔE 29,6 entre sí, 8,8 contra el top-5.
  · ⚠️ **Aviso nuevo en `/config`**: productos con "matrícula" en el nombre que ningún servicio
    reclame por código. Este fallo es **más callado** que el de los grupos huérfanos: una matrícula
    nueva SÍ tiene grupo (el de su academia), así que entraría como "Academia …" y el aviso viejo
    nunca la vería.
- 🎨 **`servicios.color` NO se elige a ojo** (migración 0064, 2-ago-2026). El club reportó que "los
  azules y grises no se diferencian"; la causa real era que **CINCO grupos compartían el mismo hex**
  (`#3e6280` = Clases de tenis + Clases de pádel + Clase particular; `#37474f` = las dos Academias
  Recreativas; `#8aa0a8` = los tres Alquileres; `#b591e0` = Patrocinio + Torneo + Patrocinio torneo;
  `#5c6bc0` = Comp. Tenis + Alto rendimiento Joaquín), o sea ΔE **0,0**: indistinguibles, no
  parecidos. Encima los azules tenían croma < 0,07 — por debajo de ~0,10 un tono se lee como gris.
  Los nuevos salieron del **validador de la skill `dataviz`** (`scripts/validate_palette.js`, ΔE en
  OKLab con daltonismo protan/deutan simulado), no del gusto: mis primeros intentos "sobrios" a mano
  fallaron todos, porque mantenía la misma luminosidad en los 7 tonos — **la separación necesita
  mover tono Y claridad a la vez.**
  ⚠️ **Hay un techo duro: ~9 colores.** Se midió por fuerza bruta sobre todo el espectro — pasados
  9, no existe ningún color que se despegue de los anteriores. Con 22 servicios eso obliga a dos
  niveles: los **7 que pelean el top-5 de la dona** (medido mes a mes: Patrocinio, Acad. Rec. Tenis,
  Clases tenis, Clases pádel, Cafetería, Alquiler pádel, Vacacionales) pasan *todos contra todos*
  (peor par ΔE 9,2 daltonismo / 17,7 visión normal); el resto vive dentro de **"Otros"** y solo sale
  en listados donde cada fila lleva nombre y cifra, así que ahí el color refuerza pero no carga solo
  la identidad. Al crear un servicio nuevo **no inventar un hex**: correr el validador contra la
  lista. Va por migración porque `/config` es solo lectura.
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
  ⚠️ Esteban, Jorge y Cristian dan academia con **salario fijo**: tienen regla explícita `academia` /
  `fijo_por_clase` en **$0** llamada "Academia · cubierta por salario fijo" (ids 25, 26 y 41, insertadas a
  mano en la BD, no en migración). No cambia el pago —ya era $0 por no casar ninguna regla— pero la
  liquidación ahora dice POR QUÉ: antes "$0 porque va en su salario" y "$0 porque falta configurar la
  regla" se veían idénticos, así que un olvido era invisible. Regla general: **todo el que dé academia
  necesita regla de academia, aunque sea en $0.**
  💡 **Y el corolario que faltaba: lo mismo aplica a las CLASES, no solo a la academia.** Al pasar a
  Cristian Castro a salario fijo (16-sep-2026) se le pusieron DOS reglas en $0, no una: `academia`
  (concepto exacto) y **`clase`** (comodín, que cubre particular Y paquete). Con solo la de academia,
  sus 35 clases habrían quedado en $0 sin explicación. **Al poner a alguien a salario fijo hay que
  tapar los dos frentes.**
  ⚠️ **El ROL dice qué ve; las REGLAS dicen cómo se le paga.** Eran la misma respuesta (`role =
  'profesor'`) y se rompió con **Willington**: es **coordinador deportivo** y además dicta las clases
  de 7 a.m., con salario fijo $4M + comisión 50% ya configurados. Al pasarlo a coordinador (jul-2026)
  desapareció de la liquidación —sus dos reglas no se calculaban, en silencio— y de los selectores de
  profesor, así que sus clases ni siquiera se le podían asignar. Arreglado en dos sitios:
  · `liquidacion.ts` → `esDocente()`: entra quien tenga rol profesor **O** reglas activas **O**
    compensación vieja. Es **aditivo a propósito**: quien tenga rol profesor sin reglas sigue saliendo
    (en $0 visible) en vez de desaparecer.
  · **ficha del empleado** (`/empleados/[id]`) → la tarjeta "Compensación" salía solo con
    `role === "profesor"`, así que **las reglas de Leo, Sebastián y Willington no se veían ni se
    podían editar** (Laura lo notó con Leo, 24-sep-2026). Ahora sale si es profesor **o** tiene
    reglas **o** compensación vieja; a cualquier otro empleado se le ofrece plegado "¿Dicta clases?
    Configurar reglas de pago". Prueba: `tests/empleados-render.test.tsx`.
  · pickers → RPC **`staff_docentes(p_solo_activos)`** (migración 0061), que usan `profesoresActivos`
    y `profesoresParaFiltrar`. Va como función NUEVA y no como parámetro de `staff_directorio` para no
    hacer DROP+CREATE de una firma que ya usan cinco pantallas. SECURITY DEFINER porque
    `profesor_regla` guarda sueldos y recepción no puede leerla: la función la consulta por dentro y
    devuelve solo id/nombre/rol/estado. Verificado desde una sesión de recepción — ve **0 reglas** y
    **8 docentes**. **TODOS los entrenadores activos están migrados** al modelo de
  reglas (Leo, Joaquín, Dairon, Cristian, Willington, Esteban, Sebastián, Jorge); nadie usa ya el modelo
  viejo, pero `profesor_compensacion`/`profesor_valor_clase` quedan como respaldo/tumba. **Pickers de
  ♟️ **Movimiento de pádel (16-sep-2026, instrucción de Laura).** Entró **Juan Cruz** y se le
  cargaron **las mismas 4 reglas que tiene Leo Ruíz**: particulares 50% · paquetes 50% · Academia
  Recreativa Pádel `fijo_por_clase` **$90.000** · Academia Competencia Pádel `pct_siigo_servicio`
  **25%** (servicio 22). Y **Joaquín Della Mea SALE de las academias**: sus reglas 7 y 8 quedaron en
  `activo = false`; conserva particulares y paquetes al 50%. El 25% de Competencia Pádel queda
  repartido **Leo 25% + Juan 25%**, o sea el mismo 50% total que había con Leo + Joaquín — no cambia
  lo que paga el club, cambia a quién.
  ⚠️ Se desactivan, **no se borran**: la liquidación de quincenas pasadas tiene que poder explicarse.
  💼 **Cristian Castro pasó a SALARIO FIJO puro** (16-sep-2026, dictado por Laura): **$3.500.000
  mensuales y ninguna comisión.** Se desactivaron sus dos reglas por clase (id 11, particulares
  `escalonado_asistentes` 1→$35.000 / 2→$45.000 / 3→$55.000; id 12, "Apoyo Academia"
  `fijo_por_clase` $35.000) y entraron la de salario (id 40) más las dos en $0 (ids 41 y 42).
  · **Es un cambio grande de contrato, no un ajuste**: con las reglas viejas cobraba **$485.000 en
    agosto y $710.000 en septiembre** por clase dictada. Ahora son $3.500.000 fijos pase lo que pase.
  · 💡 **De paso se tapó un hueco que ya existía**: sus **2 clases de paquete de septiembre** no
    casaban NINGUNA regla (solo tenía `clase_particular` y `academia`), así que pagaban $0 en
    silencio. Ahora caen en "Clases · cubiertas por salario fijo" — el mismo $0, pero con nombre.
  · Verificado: sus 35 clases cerradas caen todas en una regla con nombre; antes eran 33 de 35.

  🕐 **Esteban Graciano se paga POR FRANJA HORARIA** (16-sep-2026, dictado por Laura). El salario
  fijo baja de **$4.000.000 a $1.834.996** y el día se parte en bandas: unas las cubre el salario y
  otras pagan comisión del 50%.

  **El fin de semana tiene sus propias bandas**, así que son TRES calendarios distintos:

  | Día | Franja | Cómo se paga | Regla |
  |---|---|---|---|
  | lun–vie | 07:00–08:00 | comisión 50% | id 19 |
  | lun–vie | 08:00–11:00 | cubierta por el salario ($0) | id 32 |
  | lun–vie | 11:00–12:00 | comisión 50% | id 33 |
  | lun–vie | 15:00–19:30 | cubierta por el salario ($0) | id 34 |
  | lun–vie | 19:30–23:59 | comisión 50% | id 35 |
  | **sábado** | 08:00–13:00 | cubierta por el salario ($0) | id 37 |
  | **sábado** | fuera de esa franja | comisión 50% | id 38 |
  | **domingo** | todo el día | comisión 50% | id 39 |
  | cualquier otra | **"Fuera de sus franjas · revisar"** ($0) | id 36 |

  · Se desactivó la vieja **"Comisión clases 1 p.m."** (id 20, 13:00–14:00): la franja 12–15 entre
    semana ya no es de comisión. **No movió plata**: medido, 0 clases a esa hora.
  · ⚠️ El rango es **[desde, hasta)** (`reglaClaseAplica` en liquidacion.ts), así que 08:00–11:00
    cubre las de 8, 9 y 10 y deja las de 11 para la banda siguiente. Al agregar una banda, pegarla al
    borde de la anterior o queda un hueco.
  · ⚠️ **En sábado el ORDEN es lo único que separa las dos reglas.** La de comisión (id 38) NO filtra
    por hora —cubre todo el sábado— y solo funciona porque la de salario (id 37) tiene `orden` menor
    y gana primero. Invertirlos le pagaría comisión también de 8 a 1. Igual con domingo (id 39), que
    tampoco filtra hora.
  · 💡 **La regla 36 es la red de seguridad, y se ganó el puesto el primer día.** Sin ella una clase
    fuera de todas las bandas paga $0 **sin que nadie lo vea** — el fallo que este archivo persigue
    en todas partes. Al ponerla cazó la clase **331 (domingo 23-ago, 8 a. m., $110.000)**, que caía
    fuera porque entonces todas las bandas eran lun–sáb; se le preguntó a Laura y de ahí salieron las
    reglas del fin de semana. Esa clase **pasó de $0 a $55.000**. Hoy la 36 no captura nada, y así
    debe seguir: si algún día aparece algo ahí, es que falta una banda.
  · Verificado contra sus 44 clases cerradas simulando `reglaClaseAplica` en SQL: cada una cae en una
    regla con nombre. Agosto $2.219.996 · septiembre $1.949.996 (salario + comisiones).
  🕐 **Yeison Bedoya también se paga POR FRANJA** (16-sep-2026, dictado por Laura). Mismo salario
  que Graciano —**$1.834.996**— pero **bandas propias**, que es justo por lo que se frenó "cópiale lo
  de Graciano": los dos dan a horas distintas.

  | Día | Franja | Cómo se paga | Regla |
  |---|---|---|---|
  | lun–vie | hasta 13:30 | comisión 50% | id 51 |
  | lun–vie | 13:30–21:00 | cubierta por el salario ($0) | id 52 |
  | **domingo** | 08:00–13:00 | cubierta por el salario ($0) | id 53 |
  | sábado | **no trabaja** | — (cae en la 54) | — |
  | cualquier otra | **"Fuera de sus franjas · revisar"** ($0) | id 54 |

  Más el **salario fijo** (id 49) y la **academia en $0** (id 50), por la regla de tapar los dos
  frentes al poner a alguien a salario.
  · 💰 **Su salario son $3.500.000, no los $1.834.996 de Graciano.** Laura dictó primero *"el mismo
    que Graciano"*, pero esa misma noche **la dueña la llamó a confirmarle el precio final** y ella
    lo corrigió a mano desde `/empleados/[id]` (16-sep-2026, 22:15). **Es el valor bueno y está
    confirmado**: no "arreglarlo" a $1.834.996 por más que la instrucción original dijera otra cosa.
    Que coincida con el de **Cristian Castro** es casualidad, no un copiado.
  · **De 12 a 1:30 es comisión, y eso ya lo confirmó Laura** (16-sep-2026). Ella dictó "de 1:30 a 9
    salario, todo lo de la mañana comisión" y no dijo nada de ese hueco; se estiró la banda de
    comisión hasta las 13:30 para que no quedara sin regla, y al preguntarle respondió *"de 12 a 1:30
    déjalo también como comisión"*. Ya no es interpretación.
  · El **50%** tampoco lo dijo esta vez: sale de su instrucción anterior (*"la misma configuración de
    Graciano"*), que es el único porcentaje que hay sobre la mesa.
  · **Después de las 9 p.m. y el domingo después de la 1 NO tienen banda, a propósito**: ella dijo
    dónde termina el salario y no qué pasa después. Caen en la 48 y salen con nombre para
    preguntarle, en vez de pagarse solas.
  · ⚠️ **El sábado no lleva regla porque no trabaja.** Una clase suya en sábado cae en la 48 y paga
    $0 CON NOMBRE: es exactamente lo que se quiere, porque significa "esto no debería existir,
    revísalo", no "se me olvidó configurarlo".
  · Verificado contra sus **50 reservas reales** de ago–sep en EasyCancha (las 57 menos 7 canceladas):
    **todas caen en una banda con nombre**, ninguna en la 48, y **no hay ni una en sábado** — la
    instrucción de Laura cuadra con lo que EasyCancha ya muestra. Su única clase cerrada, la **454**
    (martes 15-sep, 7 p.m.), cae en *Cubierta por salario*: sigue pagando $0, pero ahora **dice por
    qué**. Antes era $0 por no tener ninguna regla, que se ve igual y significa lo contrario.
  · 💡 Dato para leer su liquidación sin sustos: de sus 50 reservas, **solo 3 son de comisión** (las
    de miércoles a las 9 y 10 a. m.). Casi todo lo que dicta cae dentro del salario, así que su pago
    variable va a ser pequeño y eso **no es un fallo**.
  ⚠️⚠️ **Y aquí salió un fallo nuevo del que hay que acordarse: `reglas.update` BORRA Y REESCRIBE
  todas las reglas del profesor, y el `audit_log` solo guarda cuántas quedaron.** El 16-sep-2026 a
  las 22:15 Laura guardó las reglas de Yeison desde `/empleados/[id]` y eso **eliminó las seis que
  se habían insertado por SQL (ids 43–48) y creó otras seis (49–54)**. El cambio era legítimo —
  estaba corrigiendo el salario a $3.500.000 tras hablar con la dueña— pero la entrada del audit
  (`before: null`, `after: {"reglas": 6}`) **no permite reconstruir qué había antes**: se vio que el
  sueldo había cambiado solo porque se sabía de memoria qué se había insertado. **Un cambio de
  salario hecho desde la app hoy no deja rastro de su cifra anterior.**
  ✅ **Resuelto de rebote con la VIGENCIA de las reglas** (24-sep-2026, ver "📅 Vigencia de las
  reglas" abajo): guardar ya no borra y reescribe, y el `audit_log` guarda el `before` completo de lo
  que se cierra o se borra. (Sigue valiendo: los ids de las reglas no son estables — no citarlos como
  si lo fueran.)
  Ojo con el nombre: Laura dice **"Jason"** y la persona es **Yeison Bedoya**.
  ⚠️ **Victor Acosta** tiene solo `clase_particular` (escalonado 1→$40.000, 2→$60.000) y **NO tiene
  regla de paquetes**. Se le preguntó a Laura el 16-sep-2026 y decidió **"de momento dejémoslo así"**,
  así que es una decisión tomada, no un olvido: **no agregarle la regla por iniciativa propia.**
  Consecuencia conocida y aceptada: si dicta una clase de paquete, se liquida en $0.
  **Pickers de
  profesor filtran por `activo`** (clases/eventos/academias).
- **EasyCancha ↔ profesor**: el courtName ("Profesor Willinton - Cancha 3") da el profe del calendario
  vía `claveProfesor()` (normaliza sin prefijo/acentos) + tabla `easycancha_profesor_alias` (clave→perfil).
  Materializar reserva = se elige el perfil a mano (solo activos).
  - 💡 **Eran DOS duplicados distintos, no uno.** (a) En EasyCancha el mismo profesor aparece con
    varios prefijos ("Profesor Willinton" / "Entrenador  Willinton" / "/ Profesor Willinton") — eso
    sigue vivo y es lo que resuelve `claveProfesor()`. (b) En `profiles` había además una ficha
    duplicada "Entrenador  Willinton", nacida de esa misma importación; **se borró el 31-jul-2026**
    tras verificar 0 referencias en las 20 columnas que apuntan a un perfil. Hoy hay un solo
    Willington (coord. deportivo, activo).
  - ✅ **Renombrar en `profiles.nombre` NO rompe el enganche** (verificado jul-2026, cuando Laura
    limpió los nombres del staff): la clave sale del **texto de EasyCancha**, se resuelve a un
    `profesor_id` (uuid) y `profiles.nombre` solo se usa al final para PINTAR. El enganche es por id.
  - ⚠️ **Lo que sí lo rompe es que renombren la cancha en EasyCancha.** Si allá cambian "Profesor
    Willinton" por "Profesor Willington", la clave pasa a `willington`, ningún alias casa y el
    calendario deja de atribuir esas reservas — **en silencio**, igual que el renombre de grupos de
    producto en Siigo (ver arriba).
  - ✅ **Los 8 alias están completos** (jul-2026). No hay respaldo por nombre: si falta el alias, se
    muestra el texto crudo de EasyCancha. Las claves REALES medidas sobre jun–jul 2026 (2.554
    reservas) son: `leo ruiz` · `cristian castro` · `esteban graciano` · `joaquin` · `willinton` ·
    `jorge` · `sebastian nino` · `dairon guarin`. Cobertura verificada: **1.188 / 1.188 (100%)**.
    Ojo, la clave sale del texto de EasyCancha y no siempre es el nombre completo (`joaquin` →
    Joaquín Della Mea, `jorge` → Jorge Pérez): **al entrar un profesor nuevo hay que crearle su fila**,
    porque nada lo hace automáticamente y el fallo es silencioso.
  - 🩹 **Y el fallo silencioso OCURRIÓ: son 10 alias desde el 16-sep-2026.** Entraron dos profesores
    y a ninguno se le creó la fila, así que sus reservas venían sin profesor. Medido sobre septiembre
    (1.534 reservas): **`juan cruz` 37** ("Profesor Juan Cruz - Cancha 1/2/3" y "/ Profesor Juan
    Cruz - Cancha 4") y **`yeison bedoya` 56** ("Entrenador Yeison Bedoya - Cancha 1/2/3/4"). Ya
    están creados. **La comprobación que lo caza** es listar los `courtName` del mes, pasarlos por
    `claveProfesor()` y ver cuáles no tienen alias — vale la pena repetirla cada vez que entre gente
    nueva, porque nada avisa.
  - ⚠️ Queda **`mauricio`** sin alias (1 reserva de sep-2026, "Entrenador  Mauricio - Cancha 1"): no
    existe en `profiles`, así que no hay a quién apuntarlo. Es el mismo "Mauricio" de la nota de la
    clase 429. Preguntarle al club quién es antes de inventarle una ficha.
  - ✅ **Las variantes de un mismo profesor ya se unifican solas**: "Profesor Willinton",
    "Entrenador  Willinton" y "/ Profesor Willinton" dan las tres `willinton`, porque `claveProfesor()`
    quita prefijos, tildes y signos. Sus 99 reservas nunca se estuvieron perdiendo.
  - ⚠️ El ranking del dashboard (`src/lib/easycancha.ts`) tenía su **PROPIA copia** de
    `profesorDeCancha`, parecida pero no igual: quitaba el prefijo con `/^(entrenador|profesor)\s+/`,
    que no casa si el nombre empieza por otra cosa — partía a Willington en "Willinton" (98) y
    "/ Profesor Willinton" (1). Ya usa la función compartida + `claveProfesor()` y resuelve el nombre
    por alias. **Moraleja: una segunda copia de la normalización es una bomba de tiempo.**
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
  la academia se paga `fijo_por_clase` (Leo $90k, Juan Cruz $90k; Joaquín y Cristian ya no), así que meter un
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
  ⚠️ La pestaña por defecto es **"Todas"**, no "Para mí" (`esFiltro()` en notas.ts, jul-2026): desde
  la revisión de permisos, `/notas` es la pantalla de inicio de todo el que no es superadministrador,
  y al entrar debe ver el tablón del turno completo, no solo lo que le tocó a él.
  ⚠️ **EDITAR ≠ RESOLVER, y son dos banderas distintas** (migración 0063, 31-jul-2026). `puedeEditar`
  era `autor || admin || soy destinatario` — igual que la política `notas_update`, o sea consistente,
  pero cruzado con "sin etiquetar = se reparte a TODO el staff" el efecto real era que **cualquiera de
  los 9 podía reescribir cualquier nota del tablón general**, y `ADMIN_NOTAS` quedaba inerte. Ahora
  `puedeEditar = esAutor` y se agregó **`puedeResolver`** con la fórmula vieja. Ojo al tocar esto:
  `nota-card` ya tenía prop `puedeResolver` pero las pantallas lo alimentaban con `puedeEditar`, así
  que cambiar solo `puedeEditar` **habría dejado a los destinatarios sin poder resolver** lo que se
  les asigna, que es para lo que existe el módulo. El candado real es el trigger
  **`notas_solo_autor_edita`** (texto/prioridad/para_todos/`autor_id`), NO la política: resolver y
  reabrir también son UPDATE sobre `notas`, y RLS decide por fila, no por columna. Mismo patrón que
  `profiles_blindar_rol`. Verificado con prueba revertida simulando dos usuarios: el no-autor queda
  bloqueado al editar, **sí puede resolver**, y el autor edita sin problema.
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
- 🗑️ **`pagos`, `asignaciones_pago` y `abonos` SE BORRARON** (migración 0077, 25-ago-2026). Eran el
  modelo viejo de cobros internos, muerto desde que Siigo manda para el dinero; medido antes de
  borrar: **0 filas las tres**, así que no había historia que perder.
  ⚠️ **Estar vacías no bastaba** — tenían dos amarras vivas que hubo que soltar primero, y por eso
  el orden importa: (a) `evento_participantes.pago_id`, una FK a `pagos` que ningún archivo leía;
  (b) **dos pantallas seguían consultándolas**, el *dashboard sencillo* y **`/agente`**, y como la
  tabla estaba vacía **sumaban $0 sin fallar**: el marcador decía "Conciliado este mes: $0" y el
  agente respondía con cifras en blanco. Ese es el fallo callado que justifica borrar en vez de
  dejar tablas muertas "por si acaso": nadie lo notó en meses.
  Las dos ya salen de los RPCs de Siigo — el marcador de `siigo_recaudo` (con
  `p_excluir_eventos: true`, igual que el dashboard del SA) y el agente de `siigo_recaudo` +
  `siigo_ingreso_servicio`. Verificado: el marcador pasa de $0 a **$159.342.003** en agosto, y el
  agente de `{}` a las cifras por servicio. Sus claves del JSON cambiaron de
  `conciliado_mes_por_servicio`/`total_conciliado_mes` a `facturado_mes_por_servicio`,
  `total_facturado_mes`, `total_cobrado_mes` y `pendiente_de_cobro_mes`.
- **Tablas en desuso** (persisten, no borrar aún): `profesor_valor_clase` y
  `profesor_compensacion` — son el respaldo del modelo viejo de pagos a profesores y **sí tienen
  filas** (2 y 5).
  ⚠️ **`profesor_valor_clase` ya NO SE ESCRIBE desde ningún sitio** (15-sep-2026). El formulario de
  `/empleados/nuevo` pedía un **"Valor por hora (COP)" OBLIGATORIO para profesores** que se guardaba
  ahí y **no lo leía nadie**: la liquidación calcula con `profesor_regla` y `profesor_compensacion`,
  y `liquidacion.ts` no menciona esa tabla ni una vez. Medido: a **Victor Acosta** le quedó en
  **"$100"** por un dedazo y su pago salía correcto igual, porque el número no se usa.
  💡 El daño no era el campo muerto sino lo que HACÍA CREER: que con eso el profesor quedaba
  configurado. Lo que decide su pago son las **REGLAS**, que se cargan aparte en su ficha — y
  **Yeison Bedoya quedó con 0 reglas**, o sea que su primera clase se habría liquidado en $0 sin un
  solo aviso. Se quitaron el campo, su validación (`valorClase` + el `refine` del esquema), el
  insert de `createEmpleado`, la acción `updateValorClase` y el componente **`valor-form.tsx`**, que
  encima estaba **huérfano** (nadie lo importaba; ojo, se llama `ValorClaseForm` igual que el de
  `/clases`, que sí está vivo y es otro).
  💡 El formulario de crear empleado NO pide las reglas de pago, y **así se queda** (Laura,
  24-sep-2026): el club le avisa cuando entra alguien y ella misma le construye las reglas desde su
  ficha. No proponer el aviso de "profesor sin regla".

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
eventos) · `/clientes` (paginado 30, autocomplete) · `/academias` (el **planeador** por profesor + la matrícula por academia)
· `/paquetes` · `/eventos` (P&G por evento + cierre + atar sus facturas; el dashboard solo ve la
utilidad de los cerrados y avisa cuánto hay retenido en los abiertos) · `/clases` (calendario; academia = morado #8b7cf6) · `/cierre` (solo fecha ≤
hoy; academia: asistencia por estado) · `/liquidacion` (facturado vs a pagar; periodo mes/q1/q2) ·
`/empleados` (compensación + **acceso**: rol, dar/quitar entrada, asignar contraseña) · `/config`
(catálogo de servicios, **solo lectura**) · `/agente` (aún lee modelo viejo — pendiente repuntar a Siigo)
· `/notas` bandeja de recados del staff (ver abajo) · `/perfil` "Mi perfil", cualquier rol (ver abajo).

## 🔐 Permisos por rol (revisado con Laura el 31-jul-2026)
Fuente única: `PERMISSIONS` en `src/lib/auth/permissions.ts`. **E**=edita · **L**=solo ve · —=sin acceso.

| Módulo | SA | Coord. admin | Coord. deportivo | Recepción | Profesor | Gestión Eventos |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| dashboard (+ ingresos) | E | — | — | — | — | — |
| **cartera por cobrar** | E | **L** | — | — | — | — |
| clientes | E | E | **L** | E | — | **E** |
| ↳ plata del cliente (`cliente_finanzas`) | E | E | — | — | — | — |
| empleados | E | E | — | — | — | — |
| academias | E | E | E | **L** | — | — |
| clases (calendario) | E | E | E | E | **L** | — |
| paquetes | E | E | **L** | E | — | — |
| eventos (torneos) | E | E | E | **L** | — | **E** |
| notas | E | E | E | E | E | E |
| cierre de clases | E | — | E | — | E | — |
| pagos (conciliación) | E | E | — | — | — | — |
| liquidación · agente | E | — | — | — | — | — |
| config (catálogo de servicios) | **L** | — | — | — | — | — |

- 🆕 **`gestion_eventos` — "Gestión de Eventos"** (migraciones 0068–0069, 5-ago-2026). Rol para la
  persona que maneja los torneos y nada más: eventos en control TOTAL + notas. Nace porque Laura pidió
  darle eventos a una sola persona y los permisos aquí son por ROL (`requireRole` mira `profiles.role`
  y las políticas `private.user_role()`), así que no había forma de abrirle un módulo a un usuario
  suelto; se descartó inventar excepciones por usuario porque habría que hacerlas visibles también
  desde Postgres. **No se le dio a ningún profesor existente**: se creó para una cuenta nueva (a Leo
  Ruíz se le probó y se revirtió — sigue `profesor`, porque el rol nuevo NO trae clases ni cierre y él
  dicta).
  · El valor del enum va SOLO en 0068: Postgres no deja **usar** un valor de enum en la misma
    transacción en que se agrega ("unsafe use of new value of enum type").
  · ⚠️ **`ALL_ROLES` en permissions.ts es el segundo sitio obligatorio.** `rolesForModule` solo recorre
    esa lista, y de ella salen casi todos los `requireRole`: un rol que esté en la matriz pero no en
    `ALL_ROLES` queda MUDO, con permisos que nunca se aplican.
  · ⚠️ **Había una TERCERA lista: `STAFF_ROLES` en `validations/empleado.ts`** — la que valida en el
    servidor al crear empleado (`z.enum`) y al cambiar de rol (`actions.ts:299`). Escrita a mano, no
    se enteró del rol nuevo, y el fallo salía **solo al guardar**: el selector sí ofrecía "Gestión de
    Eventos" (viene de `ROLE_LABEL`) pero el servidor respondía *"Rol inválido"* al cambiarlo y
    *"revisa los campos"* al crear. **Ya deriva de `ALL_ROLES`**, así que quedan dos sitios y el
    compilador amarra los dos (`AppRole` el tipo, `ALL_ROLES` la enumeración). Moraleja repetida: el
    selector viene de un lado y la validación de otro — probar SIEMPRE guardando, no solo abriendo.
  · **Atar facturas a un evento va por RPC, no por UPDATE** (`evento_atar_facturas` /
    `evento_soltar_factura`, SECURITY DEFINER). Atar solo cambia `evento_id`, pero una política de
    UPDATE **no puede limitar columnas**: darle write a `siigo_facturas` sería darle la tabla del
    dinero entera. La función valida el rol por dentro y toca esa única columna.
  · **También administra clientes** (`clientes` = E, migración 0070): al inscribir hay que mirar si la
    persona ya está y, si no, crearla — con solo lectura el flujo se rompía ahí y el participante nuevo
    solo podía entrar como "externo", que no engancha con la ficha ni con las facturas. Tiene lo mismo
    que recepción sobre `clientes`, `cliente_miembros`, `acudientes`, `cliente_documentos` y el bucket
    `cliente-docs`. **NO ve su plata**: ese bloque lo tapa `cliente_finanzas` (sigue en N), igual que
    con el coordinador deportivo. `buscarClientes` además acepta a quien edita eventos.
  · Verificado con prueba revertida simulando su sesión: crea y edita clientes (con su hermano y su
    acudiente), crea eventos, gastos y participantes y ata facturas por el RPC; queda BLOQUEADO al
    editar la factura directo, al crear academias y al crear clases; ve 0 filas en `clases`,
    `academias`, `paquetes_cliente` y `profesor_regla`, y solo su propio perfil.
- ⚠️ **`alter policy ... using (...)` NO toca el `with check`** (mordió en 0070, arreglado en 0071).
  Una política de UPDATE tiene dos mitades —`using` = qué filas puedo tocar · `with check` = cómo puede
  quedar la fila— y `alter policy` reemplaza SOLO la que se le nombra, conservando la otra. Al agregar
  el rol nuevo a `clientes_update` y `acudientes_update` solo con `using`, el rol podía abrir la ficha
  y el guardado rebotaba con *"new row violates row-level security policy"*. **No falla al aplicar la
  migración** y un vistazo a `pg_policies` con `coalesce(qual, with_check)` lo esconde: hay que mirar
  las DOS columnas. Las de `for all` (eventos, evento_gastos, cliente_miembros) salieron bien porque
  ahí se escribieron las dos mitades.
- ⚠️ **No verificar RLS dentro de un bloque `DO`.** plpgsql cachea el plan y la política se evalúa con
  un rol viejo: dio "BLOQUEADO" en inserts que por fuera SÍ pasaban, y habría hecho pasar por buenos
  unos permisos falsos. Verificar con **sentencias directas**, cada una en su transacción con
  `set local role authenticated` + `request.jwt.claims`, y revertir. Tampoco sirve cambiar el rol
  del perfil DENTRO de la misma transacción de la prueba: `private.user_role()` no ve ese cambio.
- ⚠️ **Un rol distinto de `profesor` NO saca a nadie de la liquidación ni de los selectores**
  (verificado con Leo, ago-2026): `staff_docentes` y `esDocente()` entran por **reglas de pago
  activas**, no por el rol. Es el arreglo que se hizo por Willington y sigue funcionando. Ojo al
  medirlo: `staff_docentes` tiene `auth.uid() is not null`, así que llamada desde service_role
  devuelve **0 filas** y parece que el docente desapareció — hay que simular sesión.
- ⚠️ **La matriz daba eventos al coord. deportivo desde el 31-jul, pero la BASE no** (arreglado en
  0069). Las políticas de escritura de `eventos`, `evento_participantes`, `evento_profesores` y
  `evento_gastos` seguían en solo SA/CA, así que Willington veía los botones de editar y **todo
  guardado le fallaba contra RLS**. Recordatorio: cambiar `PERMISSIONS` no cambia las políticas —
  son dos capas y hay que tocar las dos.
- ⚠️ **El dashboard era la puerta de entrada de todos** (login → `/dashboard`, y `requireRole`
  rebotaba ahí al que no tenía permiso). Al dejarlo solo para SA hubo que darle a cada rol otra
  pantalla de inicio: **`rutaInicio(role)`** en permissions.ts → SA a `/dashboard`, el resto a
  **`/notas`** (decisión de Laura: es el relevo de turno y el único módulo común a los cuatro roles).
  Se usa en tres sitios: el login, el redirect de `/login` con sesión abierta y el fallback de
  `requireRole`. Dejar `/dashboard` fijo en cualquiera de los tres deja al usuario rebotando.
- ⚠️ **`/dashboard` no validaba rol**, solo sesión: quitarlo del menú lo habría escondido sin
  cerrarlo. Ya tiene `requireRole`. De su rama de "dashboard sencillo" (no-SA) quedó código
  inalcanzable, conservado a propósito por si se le devuelve la pantalla a algún rol.
- ⚠️ **`/ingresos` no está en el menú**: solo se llega desde el dashboard, así que
  `reportes_financieros` es en la práctica SA-only.
- 💰 **`/cartera` se separó de `reportes_financieros`** (24-ago-2026, permiso propio `cartera` +
  entrada de menú). Las dos pantallas vivían bajo el mismo permiso pero dicen cosas distintas:
  `/ingresos` dice **cuánto entró** (la facturación del club) y `/cartera` solo **quién debe**. Laura
  pidió que el coordinador administrativo pudiera cobrar sin ver lo primero, y con el permiso
  compartido era imposible dar una sin la otra. No le abre un dato nuevo: en la Bolsa de pagos ya ve
  total y saldo factura por factura. Se descartó *crear un módulo aparte* (habría duplicado una
  consulta que ya pagina y filtra — el problema de las segundas copias que ya mordió dos veces) y
  también *recortar el dashboard* por rol (cada widget futuro necesitaría una decisión de "¿esto lo
  puede ver Juan?", y basta olvidar un condicional para filtrar la cifra que se protege).
- 💡 **El profesor VE el calendario pero no lo toca** (`clases` = L): abre el detalle de una reserva
  sin los controles de registrar. El gateo real es el prop `canAssign` de `CalendarGrid`/`DayView`,
  que decide si se pinta `MaterializarReserva`. Cerrar sus clases lo sigue haciendo en `/cierre`,
  que es otro módulo (`cierre_clase` = E).
- ⚠️ **`cerrarClase` tampoco validaba rol**, solo sesión — la pantalla `/cierre` sí, la acción no.
  Cualquiera con sesión podía cerrar una clase, y cerrar marca asistencia, que es lo que después se
  liquida. Mismo patrón que el dashboard: **el guardia de la página no protege la server action**.
- 💡 **Los guardias escritos a mano son el riesgo real, no la matriz.** La matriz solo pinta el menú;
  quien deja pasar o no es el `requireRole` de cada página y acción. Estaban desalineados: los
  torneos los llevaba `["superadmin","coord_admin"]` a mano (y ahora son del coordinador
  **deportivo**), y a recepción las acciones de paquetes la rechazaban aunque el módulo le apareciera.
  Ahora casi todos derivan de **`rolesForModule(modulo, "edit"|"read")`**. Los que siguen literales
  son los **solo-SA** deliberados, que no son de módulo: crear cuentas, cambiar rol, asignar
  contraseña y cerrar una clase vencida.
- 🏆 **Reabrir un evento ya NO es solo-SA** (24-ago-2026): entra también el **coordinador
  deportivo**, que es quien lleva los torneos (pedido de Laura: en eventos debe poder lo mismo que el
  superadministrador). La lista vive en **`PUEDE_REABRIR_EVENTO`** de `src/lib/eventos.ts`, y de ahí
  beben tanto la server action como el gateo del botón — una sola lista para las dos capas. Sigue
  siendo regla de DENTRO del módulo y no una fila de la matriz: `eventos` en E ya lo tienen también
  el coord. administrativo y Gestión de Eventos, que **no** pueden reabrir.
- ⚠️ **Los guardias se escriben de TRES formas y hay que barrer las tres.** Buscar solo
  `requireRole([…])` deja fuera las otras dos, y por ahí se colaron dos veces:
  1. lista literal — `requireRole(["superadmin", …])`
  2. **constante con nombre** — `const INSCRIBE: AppRole[] = [...]` (así seguía recepción
     matriculando niños después de dejarle academias en solo lectura: el módulo era L, pero
     `inscribirCliente` miraba una lista aparte que la incluía)
  3. **comparación suelta en la UI** — `["superadmin","coord_admin"].includes(profile.role)`
  Barrido: `grep -rnE "AppRole\[\] *=" src/`, `grep -rn 'requireRole(\[' src/` y
  `grep -rnE '\["superadmin"[^]]*\]\.includes' src/`. Solo deben quedar los solo-SA deliberados y
  `ADMIN_NOTAS` (regla de DENTRO del módulo: quién resuelve notas ajenas, no un permiso de módulo).
  ⚠️ El primer grep decía `"AppRole\[\] = \["` y **no atrapaba nada real**: las 7 constantes de
  este código son `const X: AppRole[] = rolesForModule(...)`, sin corchete después del `=`. O sea
  que el barrido daba "limpio" sin haber mirado ninguna. Corregido a `AppRole\[\] *=` en la
  auditoría del 31-jul-2026 (que, ya con el grep bueno, salió limpia: las 7 derivan del módulo
  correcto, incluidas `config` y `eventos`).
- ⚠️ **`inscribir a un niño ES editar la academia`**: no hay permiso separado. Si algún día se
  quiere "recepción inscribe pero no arma academias", hay que partir el permiso en dos.
- ⚠️ `/config` dejaba entrar al coordinador administrativo por la puerta de atrás: el módulo es
  solo-SA pero `config/actions.ts` tenía `ADMIN = ["superadmin","coord_admin"]` escrito a mano.
- `descuentos` es letra muerta (ningún archivo lo consulta); queda declarado por si se retoma.
- 🗑️ **`/reportes` se eliminó** (31-jul-2026, decisión de Laura). Mostraba conteos de clases,
  clientes activos/retirados, academias y paquetes, más el ingreso por servicio del año — y era
  solo-SA, igual que el dashboard, que ya hace lo financiero mejor. Se borró la carpeta, la clave
  `reportes_operativos` de la matriz y la entrada del menú. ⚠️ **`reportes_financieros` NO se
  tocó**: sigue vivo y es el que gatea `/ingresos` y `/cartera`. No confundirlos.
- ⚠️ **`/config` quedó en SOLO LECTURA** (31-jul-2026). Laura pidió quitarlo entero porque "esa
  información se trae de Siigo". **No es así, y ahí está la trampa**: `servicios` es una tabla
  LOCAL; Siigo ni sabe que existe. El sync compara el nombre del grupo de la factura
  (`account_group`) como TEXTO contra `servicios.siigo_grupo`, y ese emparejamiento se mantiene
  aquí. Borrar la pantalla habría dejado sin sitio dónde arreglarlo y —peor— sin el **aviso de
  grupos huérfanos**, único detector de un fallo que ya ocurrió una vez (30-jul-2026, renombre de
  los cuatro grupos de academia) y que es invisible: el total del club sigue cuadrando y solo se
  desinfla la tajada de un servicio. Se resolvió dejando la pantalla sin crear/editar/borrar:
  se eliminaron `config/actions.ts` y `servicio-form.tsx`, y la tarjeta ahora **muestra
  `siigo_grupo`**, que antes no se veía y es justo el campo que se rompe. Corregir un mapeo va por
  migración. Al medir: 0 grupos huérfanos hoy.

### 💰 Antigüedad de la cartera (24-ago-2026)
`/cartera` agrupa lo pendiente en **0–30 / 31–60 / +60 días**, con tarjetas que filtran el listado.
- ⚠️ **Se cuenta desde la FECHA DE LA FACTURA, no desde el vencimiento.** Verificado contra la API de
  Siigo: una factura trae `id, document, prefix, number, name, date, customer, seller, total,
  balance, observations, items, payments, stamp, mail, metadata, public_url` — **no hay `due_date`
  ni plazo de pago**, así que no es un dato que estemos dejando de sincronizar: no existe. Como el
  club factura casi todo en el momento, emisión ≈ vencimiento; por eso la columna se llama
  **"Espera"** y el pie aclara el criterio, en vez de decir "vencida" y afirmar lo que no sabemos.
- El agregado va en el RPC **`siigo_cartera_antiguedad(p_servicio)`** y no en JS (regla 2): hoy son
  58 facturas pendientes, pero PostgREST corta en 1.000 y el total se habría desinflado en silencio
  al crecer. El total que pintaba la pantalla tenía exactamente ese defecto.
- El RPC devuelve además los **límites de fecha** (`desde`/`hasta`) que usó cada tramo, y la pantalla
  filtra el listado con ESOS valores. Es a propósito: si la pantalla recalculara los bordes con el
  reloj de Node y el RPC usara `current_date` del servidor, la cifra de la tarjeta y las filas de
  abajo podrían desfasarse un día por zona horaria. "Hoy" también se deriva del RPC (borde de 0–30
  más 30 días) por lo mismo.

## Contexto de negocio (decisiones de Laura)
- Conciliación manual = solo deudas + facturas con cliente identificado; el mostrador anónimo queda
  cerrado como ingreso (pero siempre conciliable a mano). Conciliar una factura ata TODAS las del mismo
  NIT y guarda la cédula (auto-match futuro).
- Facturas "canasta mixta": se desglosan por línea; categoría = grupo del producto (18 grupos Siigo ↔
  catálogo `servicios`, match con trim/lowercase — ojo espacios finales en Siigo).
- Academia: cobro por sesión asistida (excusa médica no se cobra) + matrícula UNA por deporte, SEMESTRAL.
- Historia de datos arranca el **1-jun-2026**: comparativas "Mes vs anterior" serán completas desde agosto.

## 🎾 Academias: EL PLANEADOR manda (22-sep-2026 · migraciones 0078–0079 de academia)
El club pasó su Excel **"PLANEADOR BASE"** y con él se rehízo el módulo entero (tenis). **Pádel entró
el 24-sep-2026** con la misma lógica (ver "🏓 Pádel" abajo); `/academias` tiene un selector
**Tenis | Pádel** (`?deporte=padel`).

**El modelo, en una línea: la clase es `profesor + día + hora + duración`.**

```
clase_semanal      ← una celda del planeador. NO cuelga de una academia: cuelga del PROFESOR.
   └─ inscripcion_clase   ← a qué clases viene cada niño
        └─ inscripciones  ← el niño en Recreativa o Competencia (aquí vive el COBRO)
             └─ academias ← las 4, atadas a su servicio de Siigo
```

### ⚠️⚠️ Lo que obligó el cambio: la academia es del NIÑO, no de la clase
En el planeador, el **lunes 17:30 de Graciano es UNA celda con 4 niños**: Samuel Echeverry es de
competencia y los otros tres de recreativa. Se repite el miércoles a la misma hora. O sea que
"Recreativa/Competencia" **no describe la clase, describe cómo se le cobra a cada niño**. Atar la
clase a una academia partiría en dos lo que en la cancha es una sola clase.
Se comprobó por el otro lado antes de tocar nada: las 64 franjas del modelo viejo colapsaban en
**49 clases reales**, y **14 de ellas las compartían 2 o 3 "grupos"** distintos (jue 15:00 cancha 3
con Graciano = Bambi + Dumbo + Pluto, que en la cancha son 5 niños y una clase).

### Qué se fue, y por qué
- **`academia_grupo`** (nombre Disney/tenistas + nivel + rango de edad): **no existe en el Excel**.
  Ni un "Dumbo", ni un "Federer", ni un nivel. Laura confirmó quitarlos (22-sep-2026).
- **El CUPO, entero** (`grupo_franja.cupo`, `cupo_nivel()`, `franja_cupo()`, el semáforo
  verde/ámbar/rojo y el aviso de "franjas sobre cupo"). Decisión de Laura: **sin tope, solo se
  muestra cuántos van**. El club no lleva cupo y las 64 franjas lo tenían todas en null.
- El enum **`academia_nivel`**, el trigger `grupo_nivel_valido` y los RPCs `academia_grupos_resumen`,
  `grupo_franjas`, `grupo_inscritos_por_franja` y `academia_ocupacion_franja` (el tablero aparcado).
- `inscripciones.grupo_id` y `clases.grupo_id`.

### Qué se conserva
- Las **4 academias** con su `servicio_id` → grupo de producto de Siigo. **La plata sigue saliendo de
  Siigo**, nunca de `precio`/`matricula` (que son referencia y están en $0).
- El trigger **`inscripcion_un_deporte`**: un niño va a UNA academia por deporte. Verificado contra el
  Excel — **0 niños están en recreativa y competencia a la vez**, así que el candado no estorba.
- La asistencia por niño al cerrar (`/cierre`) y toda la liquidación, que no se tocaron.

### 🔑 Retirar NO borra (`inscripciones.retirada_el`)
`quitarInscripcion` hacía `DELETE`. Con asistencia de por medio eso **borra la explicación** de lo que
se dictó y se cobró. Ahora `retirarDeAcademia` apaga `activa`, sella `retirada_el` y le quita sus
clases; la ficha de la academia lista a los retirados con su fecha. Volver a entrar **reactiva la
misma fila**, no crea otra.

### Las pantallas (rediseño del 23-sep-2026)
⚠️ **El planeador ya NO es la parrilla por hora (23-sep-2026, opción C del artifact "Planeador compacto")**: con 13 filas de horas se estiraba a ~930 px y obligaba a scroll. Ahora es **una fila por profesor × los 6 días**, cada casilla con sus horas y cuántos niños van; la fila del profesor hace de leyenda del color y de puerta a su semana (reemplazó las tarjetas de profesores). **Sin marcas "COMP"** en ninguna pantalla (pedido de Laura): la academia es del niño y se ve en la ficha de la clase.
Laura encontró el planeador "desordenado". Se hicieron 3 propuestas por pantalla (artifact "Rediseño
de Academias") y se implementaron: **Planeador = A · parrilla por hora** (cada fila es una hora de
inicio, así el martes 16:30 queda a la par del jueves 16:30 — la versión anterior apilaba las clases
sin alinearlas), **Profesor = B · calendario con horas** (el alto es la duración: se ven los huecos),
**Clase = A · acciones a la vista** (mover, quitar de este día y retirar sin un "Gestionar"; retirar
pide confirmación en la misma fila) y **Matrícula = B · reparto real (1/2/3+ veces y por edad) + tabla
con buscador**.
- **Un color por profesor, el mismo en todo el módulo** (`coloresDeProfesores` en `ui.tsx`),
  asignado por orden ALFABÉTICO, no por carga: si dependiera de cuántas clases tiene, darle una clase
  a alguien le cambiaría el color a todos. La lima no está en la paleta (es acción/estado).

| Ruta | Qué contesta |
|---|---|
| `/academias` | **El planeador**: una fila por profesor × los 6 días, cada casilla con la hora y cuántos niños vienen. Reemplaza las 5 pestañas del Excel |
| `/academias/profesor/[id]` | Su semana: clases, cupos y **horas de cancha** |
| `/academias/clase/[id]` | La clase y su roster. Aquí pasa TODA la operación: agregar niño · quitar de este día · **mover a otro horario** · cambiar de academia · retirar |
| `/academias/[id]` | La **matrícula** de Recreativa o Competencia: quién está, desde cuándo, a qué clases. El lado del dinero |
| `/academias/clase/nueva` · `.../editar` | Crear y editar una clase del planeador |

- **Agregar un niño matricula de una** si todavía no estaba: en el mostrador son un solo gesto, y
  partirlas en dos pantallas es lo que dejaba niños inscritos sin ningún día.
- **Mover de clase va en un paso** (`moverDeClase`), no retirando y volviendo a inscribir.
- Cada niño muestra **cuántos días MÁS tiene a la semana**, para no retirarlo creyendo que era el
  único. Y la ficha de la academia grita cuántos están **"sin ningún día"** (hoy: 0).
- ⚠️ **Un profesor sin clases SE MUESTRA** (Yeison Bedoya, por pedido de Laura). Esconderlo dejaría
  al profesor nuevo sin forma de recibir su primera clase — el mismo criterio que `opcionesParaDeporte`.
- ⚠️ `/academias/profesor/[id]` **no exige que siga siendo docente activo**: si le dan de baja a
  alguien, sus clases tienen que seguir siendo alcanzables para reasignarlas. Solo es 404 si el id no
  es nadie Y además no dicta nada.

### 🔁 El cierre SALE DEL PLANEADOR: no se genera nada (22-sep-2026)
La programación es la MISMA todas las semanas, así que **`/cierre` le pregunta al
planeador qué debió dictarse** en vez de esperar a que alguien registre la clase.
La fila de `clases` **NACE CUANDO EL PROFESOR CIERRA**.
- Se descartó **generar** las 52 clases cada lunes (propuesta mía; Laura la corrigió y
  tenía razón): si nadie cierra se acumulan, en festivos y vacaciones crea clases que
  nunca pasaron, y un mes sin cerrar deja ~220 filas fantasma en la tabla de la que come
  la liquidación. Derivando no hay nada que generar ni nada que limpiar.
- **`clase_semanal.vigente_desde`** es el piso, si no la cola iría hacia atrás sin fin.
  Las 52 arrancan el **1-oct-2026** (decisión de Laura: empezar el mes limpio).
- RPC **`academia_pendientes(desde, hasta, profesor)`** — SECURITY INVOKER, así la RLS
  filtra sola. `/cierre` mira **30 días** hacia atrás para que la cola del día a día siga
  siendo legible; lo más viejo vive en **`/cierre/vencidas`** (solo SA), que también lo
  deriva. Nada queda escondido de quien puede arreglarlo.
- ⚠️⚠️ **Abrir la clase va por RPC SECURITY DEFINER (`clase_abrir_del_planeador`), y NO
  es opcional**: `clases_write` cubre SA/CA/coord. deportivo/recepción y **NO al
  profesor**, que es justo quien más cierra. Verificado: su `insert` directo lo rechaza
  la RLS. Si alguien lo cambiara por un insert desde la acción, **no escribiría y
  seguiría de largo sin error** — el fallo que este proyecto ya pagó con el saldo de los
  paquetes. La función valida por dentro con el mismo criterio que cerrar (coordinación/
  recepción, o el profesor de la clase) y es **idempotente**: dos clics no crean dos
  clases.
- **Índice único `clases (clase_semanal_id, fecha)`** (parcial, porque las 3 clases de
  agosto no apuntan a ninguna celda): es lo que impide que el cierre derivado y el
  registro desde `/clases` creen la misma clase por duplicado.

### 🚫 "No se dictó este día", con motivo obligatorio (23-sep-2026, idea de Laura)
Con el cierre derivado, lo que nadie cierre queda pendiente para siempre. Hacía falta una salida
para lo que el calendario no previó: un receso sin cargar, un profesor enfermo, lluvia.
- El estado `cancelada` ya existía y ya sacaba la clase de la cola; faltaba el **POR QUÉ**. Nueva
  columna **`clases.motivo_cancelacion`**, obligatoria al cancelar (`cerrarClase` rechaza sin ella)
  y limpiada al reabrir. Sin motivo, una clase cancelada por receso y una por olvido se ven iguales y
  se arreglan distinto: una está bien, la otra hay que reponerla.
- En el formulario la opción dice **"No se dictó este día"**; al escogerla desaparecen la asistencia y
  el nº de personas y aparece el motivo. **"No-show" ya no se ofrece en academia**: es de la clase
  particular (el cliente no llegó); en academia, si no vino nadie, la clase no se dictó.
- Complementa al receso, no lo reemplaza: el receso evita marcar ~100 clases a mano; esto cubre el
  caso suelto. `academia_pendientes` no necesitó cambios: cualquier fila de `clases` para esa celda
  y fecha —cerrada o cancelada— la saca de la cola.

### 🗑️ El botón "Academia" de `/clases` SE QUITÓ (23-sep-2026, pedido de Laura)
Con el cierre derivado, cafetería no tiene nada que hacer con las academias, y el botón sobre
"BLOQUEOS ACADEMIAS" solo la confundía. Ahora ese bloqueo muestra **"Bloqueo de academia · Las
clases de academia no se registran aquí: salen solas del planeador y el profesor las cierra en
Cierre de clases"** — se explica en vez de callar, porque un bloqueo sin acción y sin motivo se lee
como que algo falta. Se borraron `prepararAcademia`/`materializarAcademia` y todo el corte manual
del bloque: dejar una segunda puerta para lo mismo es lo que este proyecto ya pagó varias veces.
⚠️ Consecuencia aceptada: **ya no hay forma de registrar una clase de academia fuera del
planeador** (en festivo, o una reposición a otra hora). Laura confirmó que en festivo no dictan; si
aparece el caso de verdad, se construye con el caso a la vista.

### ⏸️ Festivos y PAUSA de academias (23-sep-2026; la pausa reemplazó al receso)
| | Qué pasa en la cola de cierre |
|---|---|
| **Festivo** | **La academia no dicta** → la clase ni se propone. Sale de la tabla `festivo`, cargada hasta 2032. El lunes 12-oct desaparece solo, con sus 10 clases |
| **Pausa** (`academia_pausa`) | **Vacaciones.** Botón **"Pausar academias"** en `/academias` el día que salen y **"Reactivar academias"** el día que vuelven. Mientras dure, la clase **ni se propone** |

- Idea de los dueños del club: más simple que cargar recesos por fechas de antemano. Reemplazó a
  `academia_receso`, que se borró (nunca tuvo una fila).
- ⚠️⚠️ **Por dentro guarda FECHAS, no un interruptor.** Con un booleano leído al vuelo, pausar
  escondería también las clases de ANTES sin cerrar, y reactivar resucitaría como pendientes todas
  las de las vacaciones (medido: **177** entre el 15-dic y el 7-ene). Pausar inserta `desde`;
  reactivar pone `hasta = ayer`, así las clases de hoy ya se piden. Pausada y reactivada el mismo día
  = la fila se borra (no tapó nada). Verificado con rollback: antes de la pausa 95 pendientes siguen,
  durante 0, al volver 42.
- **Una sola pausa abierta a la vez** (índice único parcial `where hasta is null`).
- 🔒 **Solo el SUPERADMINISTRADOR pausa y reactiva** (Laura, 23-sep-2026). A los demás no les sale el
  botón, pero **sí el aviso** mientras dure la pausa (con "Solo el superadministrador puede
  reactivarlas"). Tres capas: el botón y la acción beben de **`PUEDE_PAUSAR_ACADEMIAS`**
  (`src/lib/academias.ts`, mismo patrón que `PUEDE_REABRIR_EVENTO`), y la política
  `academia_pausa_write` (migración `20260923140000`) lo exige en la base, con sus dos mitades
  (`using` y `with check`). Leer sigue abierto a todo el staff. Verificado con rollback simulando
  sesión: el coord. deportivo queda bloqueado por RLS al insertar y el superadministrador pausa.
- La fecha de inicio se puede poner **en el pasado** (oprimieron el 16 pero salieron el 15), **no en
  el futuro**: el aviso diría "en pausa" antes de empezar.
- ⚠️ **El riesgo es olvidar reactivar**: nada falla, simplemente dejan de pedirse cierres. Por eso
  el aviso ámbar sale en `/academias` **y en `/cierre`** (`pausaActual()` en `src/lib/academias.ts`).
- Consecuencia aceptada por el club: durante la pausa, un niño que sí vaya no se puede registrar.
- `clase_abrir_del_planeador` también rechaza un día en pausa, igual que un festivo.

### 🔁 El flujo, de punta a punta (medido el 22-sep-2026)
| | Particular / paquete | **Academia** |
|---|---|---|
| Habilitar la clase | **Recepción** entra a `/clases` cada día y la registra desde la reserva de EasyCancha | **Nadie.** Sale sola del planeador |
| Cerrarla | El profesor, en `/cierre` | Igual: el profesor, en `/cierre` |

**El único paso que cambia es el primero, y desaparece.** Medido sobre `audit_log` de los últimos 30
días: **Camila Arboleda (recepción) registró 154 de 176 clases** —el 88%, la última hoy mismo— y de
academia solo hay **3 registradas en toda la historia** (Laura 2, Leo 1). Ese paso manual era
exactamente el cuello de botella.
⚠️ **`clases.registrada_por` NO es quién registró la clase: es quién registró el CIERRE.** La llena
`cerrarClase` y la borra `reabrirCierre`; el nombre engaña y me hizo leer mal la operación del club
antes de mirar el `audit_log`. Para saber quién habilita una clase hay que mirar `audit_log`
(`clase.particular` / `clase.paquete` / `clase.academia`), no esa columna.
⚠️ Consecuencia del cierre derivado que hay que vigilar: con ~10 clases de academia al día, si los
profesores no cierran a diario, a las 24 h pasan a `/cierre/vencidas` y **solo el superadministrador
puede cerrarlas**. El atraso no se pierde, pero se le acumula a una sola persona.

### El cierre dejó de adivinar
`clases.clase_semanal_id` guarda de qué celda del planeador salió la clase, así que el roster es una
lectura directa. Antes se cruzaba día + hora **±20 min** contra las franjas del grupo, y eso repartía
mal justo a los grupos que compartían cancha y hora. Las 3 clases de agosto no tienen
`clase_semanal_id` (son del modelo viejo): se caen a la lista de toda la academia y la pantalla lo
dice. Hay prueba de los dos caminos.

### 📥 El importador: `npm run import:planeador` (scripts/import-planeador.py)
Simulacro por defecto, `--apply` para escribir, idempotente. **Cargado el 23-sep-2026: 52 clases ·
109 niños · 175 enlaces · 0 niños sin día.**
- ⚠️⚠️ **Se lee "BASE DE DATOS", NO las rejillas por profesor.** Cada bloque de 30 min de la rejilla
  tiene sitio para 4 nombres y el 5º se cae a la fila de abajo, donde **parece una clase nueva**:
  medidos **13 bloques fantasma** (la "clase de Jorge martes 17:00" con Ismael, Josué y Nicolás son
  en realidad los niños 5, 6 y 7 de la de las 16:30, que en BASE DE DATOS sale con 7). Importar la
  rejilla en crudo inventaría 13 clases.
- ⚠️ **El documento se cruza JUNTO CON EL NOMBRE.** El Excel le da el mismo documento a dos hermanos
  en 3 casos (Clemente/Valentín Ramírez Arango · Elena/Matías Restrepo · Luciana Osorio/Ema Hoyos);
  cruzar solo por documento le metería la matrícula de uno al otro. Cuando el documento lo reclama un
  solo niño sí basta, aunque el nombre venga escrito distinto ("SIMON VÉLEZ" / "Simon Velez").
- ⚠️ **La llave de la clase NO incluye la duración.** El Excel pone a Krystal García en 60 min dentro
  de la clase de 90 de Graciano (lun y vie 16:00); meterla en la llave partiría esa clase en dos. Se
  toma la duración predominante y la mezcla se reporta. (En el caso de Krystal **era un error del
  Excel**: hace los 90, confirmado por Laura el 23-sep.)
- **Monte Luna y Montessori se excluyen**: son colegios, no academias (60 filas). Curiosamente son las
  ÚNICAS con la columna ASIST. llena — el club quiso llevar asistencia en el planeador y no lo logró.
  Eso es exactamente lo que hace `/cierre`.
- ✅ **109 de 109 cruzan** desde el 23-sep-2026 (0 avisos). El importador lleva tres listas
  EXPLÍCITAS, cada entrada con quién lo decidió y cuándo:
  · `ALIAS_NINO` — Ema Hoyos → "Emma Hoyos"; Valentín Ramírez Arango → "Valentin Ramirez" (m92).
  · `NO_CARGAR` — **Sara Salazar: no continúa en las academias** (Laura, 23-sep). No crearla.
  · `DURACION_CONFIRMADA` — **Krystal García hace los 90 min**; el Excel dice 60 y está mal (Laura).
  Historia de cómo se llegó ahí:
- **3 niños no cruzaban** (de 110). Revisados uno por uno el 22-sep-2026, y **son tres casos
  distintos** — no uno solo:
  · **Ema Hoyos ya estaba resuelta y no hacía falta preguntar nada.** Existe (m425, doc
    **1035002652**, nac 22-oct-2013 → 12 años, la edad que dice el Excel); lo que está mal es el
    Excel, que le puso el documento de **Luciana Osorio**. La propia rejilla del club la escribe
    "EMMA HOYOS" y la tabla "EMA HOYOS". Resuelta con `ALIAS_NINO` en el importador — lista
    EXPLÍCITA con su evidencia, no emparejamiento difuso, porque esto decide a quién se le cobra.
  · **Valentín Ramírez Arango EXISTE pero sin cédula**: es el **titular de la ficha 112**
    (`alejaro90@hotmail.com`), y Clemente es miembro de esa misma ficha. Falta cargarle documento y
    fecha de nacimiento; el Excel le puso el de su hermano.
  · **Matías Restrepo es el único que de verdad no existe**: Elena Restrepo es la ficha 430
    (acudiente Daniela Caicedo), 5 años; el Excel dice que Matías tiene 4. Hay que crearlo como
    hermano dentro de esa ficha.
  · Y **Sara Salazar** sigue sin existir. Pista para preguntarle al club: Arianna (`1125814022`) y
    Gianna Salazar (`1125814023`) sí están, con documentos **consecutivos**, y Arianna está en la
    misma clase del sábado 8:00.
- ✅ **Maximiliano Pimienta: fusionado** (22-sep-2026). Tenía DOS fichas del mismo niño (doc
  1019911784, nac 26-ago-2015): la **166** (titular **Alex Pimienta**, el papá, con 28 facturas de
  Siigo) y la **485**, que creó el importador de academias el 25-ago-2026 con el correo y el celular
  de otra persona. Sobrevive la 166, por decisión de Laura.
  ⚠️ **La 485 NO estaba vacía, y por poco se borra con algo dentro**: tenía colgada la **clase 429**
  (`clases.cliente_id = 485`), la del 12-sep que este archivo ya perseguía por otros dos motivos
  (precio en $0 contra $105.000 de EasyCancha, y sin profesor). La reserva se hizo con el correo de
  la mamá y por eso cayó en la ficha duplicada. Se movió a la 166 **antes** de borrar; `miembro_id`
  se dejó en null porque no consta cuál de los dos tomó la clase. **Moraleja: contar referencias por
  `miembro_id` no basta — hay que contar también por `cliente_id`, y sobre las 16 columnas que
  apuntan a `clientes`/`cliente_miembros`, no sobre las que uno recuerda.**
  · El correo y el celular de la 485 eran de **Luisa Quimbayo, la mamá** (dato de Laura): quedó
    creada como **acudiente 151** de la ficha 166, para no perder el contacto.
  · Rastro en `audit_log` (`cliente.fusionar`) con la ficha vieja entera. `clientes`: 501 → 500.

### 🧮 El planeador del club cuenta MAL la ocupación, y nosotros no
Su panel cuenta **una fila de niño = media hora de profesor**, así que una clase de 4 le sale como 2
horas: el martes de Graciano marcaba **175% de ocupación** sobre 6 horas disponibles. Verificado
exacto (13 filas × 0,5 + 8 de colegio × 0,5 = las 10,5 h que muestra). Encima su total global (87,5 h)
no cuadra con la suma de sus días (40,5 h). Aquí **las horas son de CLASE y los niños se cuentan
aparte**: 52 clases · 58,5 h · 170 cupos. Hay una prueba que lo fija.

### Lo que el Excel NO trae, y hay que saberlo
**Cancha** (queda opcional, solo para reconocer el bloqueo de EasyCancha) · **cupo** · **nivel** ·
**periodo/semestre** · **plata**. Si algún día el club piensa en semestres o planes de pago, hoy no
hay dónde ponerlos.

### 🏓 Pádel (cargado el 24-sep-2026 · `scripts/import-planeador-padel.py`)
**17 clases · 31 niños (27 recreativa + 4 competencia) · 57 enlaces**, vigentes desde el 1-oct.
Profesores: Leo Ruíz, Juan Cruz y Victor Acosta. El Excel es UNA rejilla (fila = hora + profesor,
celda = nombres separados por salto de línea o varios espacios), sin documentos: todo lo que no dice
o dice mal va en listas explícitas del importador, con quién lo decidió.
- **Competencia son SOLO 4 niños** (lun y mié 5–6:30 p. m. con Leo: Agustín Pérez, Matías García,
  Emilio Olarte, Pedro Correa). Esa es la única clase de 90 min; todo lo demás, 60 (Laura).
- **🏫 Clase de COLEGIO — `clase_semanal.colegio`** (migración `20260924120000`): Montessori, martes
  3 p. m. con Juan. Es academia (sale en el cierre y cuenta para el pago) pero **no lleva niños**: al
  cerrarla solo se dice si se dictó. Un trigger (`inscripcion_clase_no_colegio`) rechaza inscribir
  niños en ella, y el planeador muestra el nombre del colegio en lugar del conteo.
  ✅ En TENIS **también entraron** (24-sep-2026): 6 clases de colegio que solo están en la REJILLA de
  cada profesor, no en BASE DE DATOS — el importador de tenis ahora las lee de ahí. Jorge (mar
  14:30 Montessori, mié 14:30 Monte Luna), Cristian (mar 13:30 Montessori, mié 13:30 Monte Luna) y
  Graciano (mar 14:00 Montessori, mié 14:30 Monte Luna).
  🕐 **TODA clase de colegio dura 1 HORA**, Monte Luna y Montessori, tenis y pádel (Laura,
  24-sep-2026; ella avisa si cambia). La rejilla del Excel decía 120 min para las dos de Cristian y
  30 para la de Graciano en Monte Luna: **estaba mal**, y se corrigieron a 60 (clases 100, 101 y 103,
  con rastro en `audit_log`). Los dos importadores fijan ahora `DURACION_COLEGIO = 60` para que un
  reimporte no lo deshaga.
  💰 **Se pagan con la regla de academia de CADA profesor**, no con una tarifa de colegio como el
  Montessori de Juan en pádel (Laura). Como la clase no tiene niños, no queda atada a ninguna
  academia y casa con la regla de academia "de todas": hoy Jorge, Cristian y Graciano → $0,
  cubierta por salario. Prueba en `tests/liquidacion-academia.test.ts`.
- Isaak Salgado va el jueves 4 p. m. con **Leo** (el Excel lo ponía también con Juan). "Valentino
  Gómez (Particular)" del lunes 5 p. m. es clase particular: no entra.
- Creados como hermanos: **Ana Barbera** (ficha 58, de Armando Barbera) y **Jhonatan Dulcey** (ficha
  37, de Jhon Dulcey; el Excel dice "Jhontan", se escribe Jhonatan — Laura). Emparejados a mano: Nicole→Nicol Bustamante, Julia Vélez Jiménez→Julia Vélez,
  Pedro Gómez Laserna→Pedro Gómez (ficha 412), Sofía Moreno→**Sophie** Moreno (hija de Pierre),
  Salvador Olarte→ficha 466.
- ✅ **Simón Mejía Cadavid (ficha 571) ya tiene sus datos REALES** (Laura, 24-sep-2026): TI
  1040877829, nacido 20-mar-2010. Acudiente **Faver Mejía, el papá** (CC 15440344, 3003192800,
  faver1000@gmail.com), que es también el celular y el correo de la ficha — así que **desde ahora sí
  le llegan los correos de confirmación del cierre**.
- ⚠️ **Salomón Agudelo (ficha 572) sigue PROVISIONAL a medias**: ya tiene acudiente real, **Felipe
  Agudelo, el papá** (3112133394, también celular de la ficha), pero **faltan su documento y su fecha
  de nacimiento** (Laura los pasará). Sin correo todavía. Al llegar, **corregir esa ficha, no crear
  otra**.
- 💰 **Victor Acosta: $60.000 por clase de academia** (regla 55, `academia`/`fijo_por_clase`, dictado
  por Laura el 24-sep-2026: "cada clase de la academia de 1 hora"). Hoy todas sus clases son de 1
  hora; la regla paga por clase, no por hora — si le dan una de 90 min, revisar.
- **Salvador Olarte Peláez (ficha 324) se FUSIONÓ en la 466** (24-sep, Laura: "elimina esta ficha").
  ⚠️ No estaba vacía: tenía **3 clases particulares de pádel con Leo** (4-ago, 1-sep y 22-sep, $110.000
  c/u) y 2 asistencias; se movieron a la 466 / miembro 474 ANTES de borrar. Su correo y celular
  (`susana.pelaez.mejia@gmail.com`, +573006022850, probablemente la mamá) quedaron solo en `audit_log`
  (`cliente.fusionar`): la 466 ya tiene de acudiente a Juan Olarte.
- Valentino Gómez tiene
  nacimiento **4-oct-2026** (futuro).
- 👤 **Quién sale en el planeador**: el docente del deporte que tenga clases **o** regla de pago de
  academia activa (24-sep-2026). Así sigue saliendo Yeison sin clases (tiene su regla en $0) y deja
  de salir **Joaquín Della Mea**, que dejó las academias (sus reglas 7 y 8 están apagadas). La regla
  se lee con el cliente admin porque `profesor_regla` guarda sueldos; solo sale el id. Si entra un
  profesor nuevo de academia y no aparece, es que le falta su regla de academia.
- 💰 **Pagos de pádel (dictados por Laura el 24-sep-2026)**:
  | Profesor | Recreativa | Competencia | Montessori |
  |---|---|---|---|
  | Leo | $90.000 por clase (regla 3) | **50% de lo facturado** en Siigo (regla 4); la clase en sí $0 con nombre (regla 56) | — |
  | Juan | $70.000 por clase (regla 30) | — (su 25% se APAGÓ, regla 31) | $70.000 (regla 57) |
  | Victor | $60.000 por clase (regla 55, sin academia = todas) | — | — |
  El 50% de competencia era 25% Leo + 25% Juan; ahora es todo de Leo, que es quien la dicta.
- 🎯 **Reglas de academia ATADAS A UNA ACADEMIA** (`profesor_regla.servicio_id` con concepto
  `academia`; migración `20260924140000`). Hacía falta porque la clase de competencia de Leo cobraba
  también los $90.000 de recreativa: la regla de academia no sabía de qué academia era la clase
  (`clases.academia_id` quedaba null en todo lo del planeador). Ahora:
  · `clase_abrir_del_planeador` **congela** `clases.academia_id` al abrir la clase: la academia si
    TODOS sus niños son de la misma; null si se mezclan (lunes 17:30 de Graciano) o no hay niños
    (Montessori). Congelado a propósito: mover un niño después no cambia cómo se pagó lo pasado.
  · `liquidacion.ts`: una regla de academia con servicio solo casa si la academia de la clase apunta
    a ese servicio; sin servicio = todas (así siguen las de tenis y la de Victor).
  · En la ficha del empleado, la regla de academia tiene **"¿Qué academia?"** (Todas / una). Al
    cambiar el concepto de una regla se limpia el servicio, para que no filtre heredado.
  · ⚠️ Orden: la de Montessori de Juan NO tiene academia, así que casa con cualquier clase de academia
    de Juan que no sea recreativa pura. Va DESPUÉS de la de recreativa (orden 3 vs 2). Si Juan dicta
    algún día competencia o una clase mixta, se le pagaría como "Montessori": revisar.
  · ⚠️ Las reglas pagan POR CLASE, no por hora: Montessori ($70.000 "la hora") y Victor ("clase de 1
    hora") están bien porque sus clases son de 60 min.
  · Prueba: `tests/liquidacion-academia.test.ts` (sin el arreglo, la competencia de Leo pagaba $90.000).
- ⚠️⚠️ **El importador de TENIS retiraba a todo el que no estuviera en su Excel** — con pádel cargado
  habría retirado a los 31 niños y borrado sus clases. Se limitó a tenis (clases, matrículas y
  enlaces) el mismo día. **Cada importador toca SOLO su deporte.**

### Estado y pendientes de academias
- **Cargado**: 52 clases · 109 niños · 175 enlaces. Graciano 21 clases/65 cupos · Jorge 12/52 ·
  Cristian 10/29 · Sebastián Niño 9/24 · Yeison 0.
- ⚠️ **Sebastián Niño Mora es `coord_admin`, no profesor**, y dicta las 9 clases de competencia. Sale
  en los selectores porque `staff_docentes` entra por REGLAS DE PAGO activas, no por el rol.
- ⚠️ **Marlon Marín NO se cargó** (decisión de Laura, 22-sep-2026): tiene pestaña en el Excel pero
  vacía, y no existe en la plataforma. Si entra, hay que crearle **perfil, alias de EasyCancha Y
  reglas de pago** — las tres fallan en silencio y cada una por su lado.
- La programación cargada es la de la **semana del 14-sep-2026**, confirmada vigente por Laura.
- 🚫 **El cruce asistencia vs facturas de Siigo NO se va a hacer** (Laura, 24-sep-2026: "sería
  demasiado enredado"). El módulo de academias sirve para la **asistencia y la composición de los
  grupos** (quién va, cuántos niños, a qué clases), no para controlar cobros. No reproponerlo. (Además
  estaba bloqueado por conciliación: de 224 líneas de Academia Recreativa Tenis solo 36 tenían
  `cliente_id`.)
- ✅ **El cuello de botella (en agosto se registraron 2 clases de ~250) está resuelto**: ya no hay que
  registrar nada antes — `/cierre` deriva del planeador y la clase nace al cerrarla.
- ✅ Vacaciones: ya no hay que cargar fechas; el club oprime **Pausar academias** el día que salen.

⚠️⚠️ **Una escritura rechazada por RLS NO lanza error: no escribe y sigue de largo.** Es el mismo veneno que "leer devuelve 0 filas sin error", pero al revés y peor, porque se pierde un dato. Mordió el 4-sep-2026: al cerrar una clase de paquete, el descuento del saldo era un `update` directo a `paquetes_cliente`, cuya política de escritura solo cubre **SA/CA/recepción** — así que cuando cerraba el **coord. deportivo o un profesor (los que más cierran)** el saldo no bajaba y nadie se enteraba. Daniela Parra mostraba **8/8 disponibles con 2 clases ya dictadas**; correlación 100% con el rol de quien cerró (el único paquete correcto lo había cerrado el SA). **Ampliar la política no era la salida**: le daría al profesor la tabla entera (num_clases, descuentos, borrar) — una política de UPDATE **no puede limitar por columna**. Se resolvió con el RPC **`paquete_consumir(p_clase, p_delta)`** (SECURITY DEFINER; valida por dentro con el mismo criterio que cerrar: coordinación/recepción o el profesor dueño; toca solo el saldo y es atómico), y `cerrarClase`/`reabrirCierre` **sí miran el error**. Mismo patrón que `evento_atar_facturas`. **Regla: toda escritura que dependa de una tabla que el rol que ejecuta no puede escribir va por RPC, y SIEMPRE se mira el `error`.** La asistencia se blindó igual (su política sí cubre al profesor dueño, pero un rechazo dejaría la clase cerrada sin asistencia, que es lo que se liquida).

⏳ **Paquete VENCIDO** (4-sep-2026): el estado `vencido` estaba en el enum pero **nadie lo ponía nunca**, así que al pasar `vence_el` el paquete se seguía ofreciendo. Ahora hay **dos capas**: (1) el job de pg_cron **`paquetes_marcar_vencidos()`** (06:15 UTC = 1:15 a. m. Bogotá) marca `activo → vencido` por fecha, para que toda consulta que filtre `estado='activo'` quede bien sola; y (2) los sitios que OFRECEN paquetes (lista de clase nueva, modal del calendario y la validación del servidor en `materializarReserva`) exigen además **`vence_el >= hoy`**, porque entre que vence y corre el job habría una ventana. En `paquete_consumir`, **`vencido` y `anulado` son terminales**: cerrar una clase vieja ya no resucita un paquete muerto. Al agregar un sitio nuevo que ofrezca paquetes, filtrar por las DOS cosas.
⚠️ **Corolario**: al marcar vencidos apareció un hueco — `editarPaqueteCliente` cambiaba `vence_el` pero no el estado, así que extenderle la fecha a un vencido no lo revivía. Ahora esa acción **recalcula el estado** desde vigencia y saldo (sin saldo → agotado · fecha pasada → vencido · si no → activo; `anulado` nunca revive). Botón **"Extender vigencia"** (solo superadministrador, solo si está vencido y le queda saldo) en la fila del paquete de la ficha. **Regla: quien cambie `vence_el` tiene que recalcular `estado`, o el paquete queda vivo en la fecha y muerto en el estado.**

🗑️ **Eliminar una clase PENDIENTE — solo el superadministrador** (24-sep-2026, pedido de Laura).
Botón "Eliminar esta clase" dentro de `/cierre/[id]` (`eliminar-clase.tsx` → `eliminarClasePendiente`),
para cualquier tipo (particular, paquete, academia). Sirve para limpiar la cola de lo que nunca debió
estar ahí (las 3 academias de agosto del modelo viejo, una particular registrada por error).
- Solo si sigue **`programada`**: cerrada ya marcó asistencia, movió saldo y cuenta para la
  liquidación — eso se REABRE, no se borra. El paquete no pierde nada: el saldo baja al cerrar.
- ⚠️ Una clase del **planeador** (`clase_semanal_id`) NO se borra: la cola es derivada y el planeador
  la volvería a pedir al instante. Queda `cancelada` con motivo "Eliminada por el superadministrador".
- Rastro en `audit_log` (`clase.eliminar_pendiente`) con la fila entera. Si venía de una reserva de
  EasyCancha, esa reserva vuelve a salir sin registrar en `/clases`.
- Las opciones de asistencia dicen ahora **Asistió / No asistió / No asistió con excusa médica**
  (Laura); los valores guardados (`presente`/`ausente`/`excusa_medica`) no cambiaron.

**Cierre — dos puertas** (`cierre/actions.ts`, validadas en el SERVIDOR, no solo en la pantalla):
- **Piso**: no se puede cerrar una clase ANTES de que empiece (`fecha + hora_inicio`; las clases sin
  hora quedan disponibles todo su día). Sin esto se marcaba asistencia por la mañana de una clase de
  la tarde — asistencia inventada que además cuenta para la liquidación. La cola de `/cierre` también
  las esconde y la pantalla de detalle muestra un aviso en vez del formulario.
- **Techo**: pasadas **24 h** desde el inicio, solo el **superadministrador** puede registrar
  (`/cierre/vencidas` las lista). Ya existía y está verificado que funciona.

👤 **La ficha del cliente se busca por correo Y por CÉDULA** (15-sep-2026,
`src/lib/clientes-match.ts`). EasyCancha tenía a **Karent Coronado** como
`karentcoronadop@gmail.com` y su ficha del club como `karentcoronado@gmail.com` — **UNA LETRA**.
Como `materializarReserva` buscaba **solo por correo**, no la encontró, **creó una ficha nueva**
(550) y esa ficha no tenía paquetes: el modal dijo *"este cliente no tiene paquete activo"* y a
cafetería solo le quedó **"Particular"**. Resultado: una clase de PAQUETE cobrada como particular a
$150.000, y una Karent fantasma.
- **El dato para acertar ya venía en la reserva**: `userFoidNumber: "1128424694"`, la misma cédula
  de su ficha buena (554). Se miraba el correo y se ignoraba la cédula.
- `buscarClienteDeReserva()` la usan **los dos sitios** que buscaban por su cuenta:
  `prepararAsignacion` (lo que llena el selector de paquetes) y `materializarReserva` (lo que crea
  la clase). Una sola copia — el problema de las segundas copias ya mordió dos veces aquí.
- ⚠️ **El correo va PRIMERO a propósito.** Es lo que se usaba hasta ahora, así que mirarlo antes
  deja intacto todo lo que ya funcionaba; la cédula solo entra **cuando el correo no encuentra a
  nadie**, que es exactamente el caso que fallaba. Al revés se cambiaría el emparejamiento de casos
  hoy correctos, y esto decide **a quién se le cobra**.
- La ficha que sí se crea nace ya **con su cédula**, para que la próxima reserva de esa persona
  encuentre ESA ficha aunque el correo venga distinto otra vez.
- ⚠️ Se compara la cédula en crudo (solo dígitos). Si en la ficha quedó escrita con puntos no casa —
  pero ahí no se pierde nada: es el mismo resultado que antes.
- 🔧 **Arreglado a mano**: la clase 424 se movió a la ficha 554, atada al paquete #23 (saldo 8 → 7)
  y se fusionó la 550 (solo tenía esa clase y su titular). Con rastro en `audit_log`
  (`clase.mover_a_paquete`, `cliente.fusionar`).
- 🧹 **Limpieza de duplicados (15-sep-2026)**: había 17 nombres repetidos. Se fusionaron **8**, se
  dejaron **9** a la espera del club, y `clientes` pasó de 504 a **496**.
  ⚠️ **El nombre repetido NO basta para fusionar** — dos personas pueden llamarse igual. La
  evidencia que se usó es el **TELÉFONO normalizado** (últimos 10 dígitos) y/o el **correo idéntico**:
  · **8 con misma persona confirmada** — david de greiff (327→302), elias sotelo (54→423, además
    mismo correo), isabel duque (356→226), laura restrepo (352→387), lucas piedrahita (257→208),
    maximiliano velásquez (344→370), sofía serrano (276→411, mismo correo), tomás roldán (264→263).
    En cada par sobrevive la que tiene historia (cédula, facturas, inscripciones) y muere la vacía.
    **Las 8 que murieron estaban en CERO** (0 clases, 0 facturas, 0 inscripciones, 0 paquetes; solo
    su titular): se verificó una por una antes de borrar, incluidas las referencias por `miembro_id`.
    El correo y el teléfono de cada una quedaron en `audit_log` (`cliente.fusionar`) por si hacen falta.
  · **9 DUDOSOS, sin tocar**: andres zapata, daniel uribe, diego chalarca, enrique mateus, isaak
    ruiz, jorge moreno, laura restrepo (la 3ª ficha), manuel mejía y santiago correa. **Nada en
    común**: teléfonos y correos distintos. Dos señales de que pueden ser personas DISTINTAS —
    jorge moreno tiene un teléfono de **Chile** (+56) en una ficha y de Colombia en la otra, y
    andrés zapata tiene un correo que dice "agudelo". Hay que preguntarle al club, no adivinar.
  · 💡 Hallazgo suelto: la ficha 356 de isabel duque tenía **el teléfono metido en el campo cédula**
    (3116190917). Murió en la fusión, pero conviene saber que ese error existe.
- 🔁 **Los DOS sync de clientes hacen doble validación: correo Y cédula** (15-sep-2026, pedido de
  Laura). Antes los dos emparejaban **solo por correo**, así que quien ya estaba con otro correo
  entraba como ficha nueva — la fábrica de duplicados.
  ⚠️ **El botón de dentro de la app era el peor**: además de emparejar solo por correo, **NO GUARDABA
  LA CÉDULA** aunque EasyCancha la manda. O sea que cada ficha que creaba nacía sin la llave que
  ahora evita el duplicado, y sin la que atribuye las facturas de Siigo. Ya guarda
  `documento`, `tipo_documento` y `fecha_nacimiento`, como el script de consola.
  ⚠️ En el script (`sync-clientes-easycancha.mjs`) el `docsBD` YA existía, pero solo se usaba para no
  robarle el documento a otra ficha (`libre`): si la cédula estaba repetida, creaba la ficha igual y
  **sin documento**. Ahora se salta la creación. Los dos avisan cuántos omitieron por cédula, para
  que "no se agregó nadie" no se confunda con un fallo.
- ⚠️ **157 de 496 clientes (32%) no tenían cédula**, y son justo los que se pueden volver a duplicar:
  el emparejamiento se apoya en ella. Los nuevos ya nacen con la suya; para los viejos está
  **`npm run sync:documentos`** (simulacro por defecto, `-- --apply` para escribir).
  ✅ **APLICADO el 15-sep-2026**: 123 fichas actualizadas (105 documentos + 67 fechas de nacimiento),
  **106 facturas de Siigo enganchadas a su cliente por $17.164.032**, y los sin cédula bajaron de
  **157 (32%) a 52 (10,5%)**. Respaldo del estado anterior en `/tmp/cdaf-documentos-antes-*.json`.
  💡 **Los 27 "conflictos" NO son 27 problemas: 19 son NIÑOS.** La ficha tiene la cédula del niño
  (correcta) y EasyCancha devuelve la del **padre**, porque la cuenta de EasyCancha es de los papás.
  En esos NUESTRO dato es el bueno y no hay nada que corregir — medido por `fecha_nacimiento`: los 19
  tienen entre 3 y 17 años. Solo **8 son adultos** y necesitan revisión: 2 con el **teléfono metido en
  el campo cédula** (#115 Alex Ortiz, #129 Juan Trelles — ahí EasyCancha tiene razón), 4 dedazos de un
  dígito (#331, #353, #87, #116) y 2 con números sin parecido (#121, #122). Lista con el detalle en
  **`docs/cedulas-en-conflicto.md`**.
  ⚠️ Al leer el reporte del script, **no tomar "conflicto" como "error"**: en un club con academias de
  niños, el choque ficha-vs-EasyCancha es lo NORMAL y esperado.
- ✅ **RESUELTO (16-sep-2026): se puede cambiar una clase YA registrada de particular a paquete**
  (y al revés, y de un paquete a otro). Fila **"Cobro"** en el modal de `/clases`
  (`cobro-clase-form.tsx` → `prepararCobro` / `cambiarCobroClase`). Antes solo se arreglaba
  borrando la clase y volviéndola a crear.
  ⚠️⚠️ **Pero lo que de verdad falló fue la PANTALLA, no el dato.** Laura reportó que la clase de
  Karent del 12-sep "seguía apareciendo como clase individual": **ya estaba bien atada a su
  paquete #23** desde el arreglo del día anterior. El subtítulo decía `"Clase individual"` para
  TODAS las de `tipo = individual`, y dentro de ese tipo lo que separa paquete de particular es
  `paquete_cliente_id` — que no se pintaba en ningún sitio. O sea: **el dato correcto y la pantalla
  mintiendo**, que es peor que un dato malo, porque invita a "arreglar" lo que ya está bien. Ahora
  el subtítulo dice **"Clase de paquete" / "Clase particular" / "Clase de academia"**, el chip de la
  celda dice `Paq.`/`Part.`/`Acad.` (antes `Ind.` para las dos primeras) y el modal muestra **de qué
  paquete sale y cuánto le queda**.
  💡 Mismo veneno que este archivo ya documenta cuatro veces ("leer devuelve 0 filas sin error",
  "una escritura rechazada por RLS no lanza error", "un fallo del sistema y una clave mala se ven
  igual"): **dos situaciones que se arreglan distinto no pueden verse iguales.**
- 🩹 **Doble descuento en el paquete de Karent — error del arreglo manual, corregido el 16-sep-2026.**
  Al mover la clase 424 a su paquete se le bajó el saldo a mano (8 → 7), pero **la clase seguía
  `programada`**: el descuento lo hace `cerrarClase` → `paquete_consumir`, así que al cerrarla se le
  habría cobrado **DOS veces**. Se devolvió a `clases_consumidas = 0` (rastro en `audit_log`,
  `paquete.corregir_saldo`). Se comprobó contra los 11 paquetes reales que la invariante es
  `clases_consumidas == clases cerradas`: el 23 era el ÚNICO desviado. Hay una prueba que la fija
  para todos.
  ⚠️ **Regla: el saldo se mueve al CERRAR, nunca al registrar.** `cambiarCobroClase` solo lo toca si
  la clase está `realizada`; si está `programada` no toca nada y lo dice en pantalla
  ("se le descontará al paquete cuando se cierre la clase").
  ⚠️ **El ORDEN de los tres pasos no es intercambiable**: devolver al paquete viejo → mover la clase
  → descontar del nuevo. `paquete_consumir` lee el `paquete_cliente_id` que la clase tiene EN ESE
  MOMENTO, así que devolver DESPUÉS del update se lo devolvería al paquete equivocado. Mismo cuidado
  que en `corregirTurno`. Si el paso 3 falla, se revierte todo y se avisa.
  ⚠️ **Al pasar a paquete se limpia `valor_facturado`**: la liquidación lee
  `valor_facturado ?? valorDelPaquete` (liquidacion.ts), así que dejar el override puesto seguiría
  pagándole al profesor sobre el precio de particular.
  · Mismo techo de **24 h** que `editarValorClase`, con el mismo helper y a propósito: una sola regla
    que recordar. Pasado el plazo, solo el superadministrador.
  · Dato tranquilizador del caso Karent: el paquete vale **$149.999 por clase** y se había cobrado
    $150.000 como particular, así que el pago del profesor no cambió con la corrección.
  · Pruebas: `tests/cobro-clase.test.tsx` (10) — 6 de pantalla y 4 contra Postgres (las tres de
    movimiento de saldo se revierten; la cuarta audita los paquetes reales).
- ✅ **"Juan Cruz" ya existe** (16-sep-2026): perfil, alias de EasyCancha y sus 4 reglas de pago.
  Antes no estaba en ninguna de las dos tablas aunque la cancha dijera "Profesor Juan Cruz -
  Cancha 1", y por eso su clase salió sin profesor. **Al entrar un profesor nuevo hay que crearle
  perfil, alias Y reglas** — las tres cosas fallan en silencio y cada una por su lado.
  ⚠️ Le queda el **correo `test@gmail.com`**: no puede entrar a la plataforma hasta que Laura le
  cargue el real desde `/empleados/[id]/editar`.
  ✅ La clase 400 (7-sep, 9 a.m.) ya quedó asignada a Juan Cruz, por el selector del modal.
  ✅ **Su precio de $50.000 ES CORRECTO** aunque EasyCancha diga $130.000: fue un precio especial
  (Laura, 24-sep-2026). No "corregirlo". Y **las particulares anteriores al 15-sep ya las revisó el
  club y están bien**: no hace falta barrerlas.
- Pruebas: `tests/cliente-match.test.ts` (8), con el correo y la cédula reales del caso.

🏟️ **Un ALQUILER de cancha no se registra como clase** (15-sep-2026). En cafetería pulsaron
"Particular" sobre el alquiler de **Iván Darío Botero** (14-sep, 8 a. m.) y quedó de clase. Se
consultó esa reserva en la API y **EasyCancha la manda como alquiler sin ninguna ambigüedad**
(`courtName: "Cancha 2"`, `comments: null`, $70.000): **el error no fue de EasyCancha ni del selector
de profesor** —que solo se pinta en clases YA registradas— sino que el modal ofrecía
"A un paquete / Particular" sobre CUALQUIER reserva. **Se encontraron 5 alquileres convertidos en
clase** (420, 422, 427, 438, 443) y se borraron con rastro en `audit_log`.
- La regla vive en **`pareceClase()` de `easycancha/client.ts`**, con DOS señales en orden:
  (1) la cancha lleva profesor en el nombre — 670 de 1.354 reservas de ago–sep; (2) si viene pelada
  ("Cancha 2"), manda la **NOTA** de la reserva (`comments`) contra una lista de palabras medida
  sobre las notas reales: *clase · entrenador · profesor · profe · personalizada*.
- ⚠️⚠️ **La cancha pelada NO basta, y esto es lo que casi arruina el arreglo.** Se midió que las
  clases REALES también se reservan en cancha normal **y por el mismo monto** ($70.000, idéntico al
  alquiler): 331 Esteban, 392/436/444 Sebastián y 441 Victor. **Ni el nombre de la cancha ni el
  precio distinguen**; lo único que distingue es la nota. Filtrar por cancha habría bloqueado trabajo
  legítimo del club.
- ⚠️ **Se ESCONDE, no se bloquea.** Hay clases reales **sin nota** (la del 23-ago de Esteban venía en
  blanco), así que el modal muestra "Esto es un alquiler de cancha…" + el enlace **"Me consta que sí
  fue una clase, registrarla"**, que destapa los botones. Bloquear habría creado el fallo de siempre:
  trabajo real imposible y nadie entiende por qué.
- ⚠️ **La nota se USA para decidir pero NUNCA se muestra** en una reserva de cliente: ahí el club
  escribe datos privados ("PAGA LA PRIMERA SEMANA DE MAYO"). Se resuelve en el SERVIDOR y a la
  pantalla solo viaja el booleano `ec.pareceClase`. Sigue mostrándose el texto solo en los bloqueos.
- 💡 **La misma regla salvó dos clases de ser borradas**: de las 7 candidatas, **429** ("Clase
  personalizada con Mauricio o Salamanca") y **426** ("clase victor") SÍ eran clases. Verificado
  contra los 6 casos que la dueña confirmó a mano: **6 de 6**. Pruebas en
  `tests/reserva-vs-clase.test.ts` (24), con las reservas y notas reales.
- ✅ **La clase 429 se ELIMINÓ el 23-sep-2026**: Laura confirmó que **era un alquiler**, pese a la
  nota "Clase personalizada con Mauricio o Salamanca". Lo borró ella con el botón nuevo de
  `/cierre/[id]` (motivo "Es un alquiler de cancha"). Con eso se cierran su precio en $0 y su falta de
  profesor. La reserva vuelve a salir sin registrar en `/clases` y, por la nota, el modal la sigue
  ofreciendo como clase: **no volver a registrarla**. Ese día también borró las 3 academias viejas
  de agosto (338, 339, 357).

🎾 **Asignar el profesor a una clase que llegó SIN profesor** (15-sep-2026, migración 0089).
El club crea reservas en EasyCancha sin profesor —el profe es nuevo y allá todavía no existe, o
simplemente se les olvida— y al materializarlas la clase entra con `profesor_id = null`. **El daño
es invisible**: `liquidacion.ts` salta esas clases (`if (!c.profesor_id) continue`), así que la
clase se dictó, se cobró y no se le pagó a nadie, sin un solo error por ningún lado. Medido al
construirlo: **12 clases así, del 7 al 14 de septiembre**, ninguna cerrada todavía.
- La fila "Profesor" del modal de `/clases` cambia el guión por un **select**
  (`profesor-clase-form.tsx` → `asignarProfesorClase`), mismo patrón que `ValorClaseForm`.
  **No hubo que tocar `/cierre` ni `liquidacion.ts`**: los dos ya leen `clases.profesor_id`, así que
  con el profesor puesto la clase le entra sola a su liquidación.
- ⚠️ **Solo aparece si la clase NO tiene profesor.** Esto REPARA una omisión, no reasigna: poner a
  alguien donde no había nadie solo puede SUMARLE una clase a su liquidación, nunca quitársela a
  otro. Cambiar un profesor ya puesto movería plata de una persona a otra y es una decisión distinta
  que hoy no existe. La acción lo revalida en el servidor y el `update` lleva `.is("profesor_id",
  null)` por si dos personas lo asignan a la vez.
- ⚠️ **NO lleva el techo de 24 h de `editarValorClase`, a propósito.** Estas clases se descubren
  justamente tarde (la del 12-sep apareció el 15): un plazo de 24 h dejaría sin arreglo exactamente
  los casos que motivaron esto. El rastro queda en `audit_log` (`clase.asignar_profesor`).
- 🆕 **`profiles.deportes`** (`deporte[]`, migración 0089) — no existía NADA que dijera si un
  profesor es de tenis o de pádel, y sin eso no se puede ofrecer "los de pádel para una clase de
  pádel". Se marca en `/empleados/[id]/editar` y lo blinda el trigger `profiles_blindar_rol` (junto
  con `role`/`activo`/`marca_turno`): si no, un profesor podría quitárselo desde "Mi perfil" y
  desaparecer del selector de su propia cancha. Verificado con prueba revertida: el profesor queda
  bloqueado al cambiarse el deporte y sigue pudiendo editar sus otros datos.
- ⚠️ **El que no tiene deporte marcado SE MUESTRA, en un grupo "Sin deporte asignado"** — no se
  esconde. Filtrar estricto habría dejado fuera del selector justo al **profesor nuevo**, que es uno
  de los dos casos que se querían resolver. Medido: de los 8 docentes activos, **Victor Acosta y
  Yeison Bedoya no tienen ni una clase dictada**. Por eso también se descartó *deducir el deporte
  del historial*: a ellos dos los habría dejado invisibles.
- Los otros 6 sí se pre-llenaron desde su historial real, que salió **inequívoco** (ninguno ha
  dictado los dos deportes): Cristian 34 tenis · Esteban 42 tenis · Jorge 2 tenis · Sebastián 4
  tenis · Leo 65 pádel · Joaquín 4 pádel. Fue un `update` de datos, no migración, porque el campo se
  edita desde la ficha del empleado.
- ⚠️ Las casillas van con **`formData.getAll("deportes")`** y NO por el esquema de zod:
  `Object.fromEntries(formData)` se queda solo con la última marcada. Mismo patrón que los arreglos
  paralelos de los horarios de academia.
- ⚠️ Agregar `deportes` a la salida de `staff_docentes` obligó a **DROP + CREATE** (cambia el tipo de
  retorno). `StaffDocente` va aparte de `StaffMiembro` porque `staff_directorio` NO trae deportes.
- Pruebas: `tests/profesor-clase.test.tsx` (13). ⚠️ Montan **`ProfesorClaseForm` suelto y no
  `EventoDetalle`**: el modal usa `DialogTitle` de Base UI, que exige el contexto del diálogo y
  revienta con `renderToStaticMarkup` — ya documentado arriba con la foto de turno.

⚠️ **Una prueba no puede depender de un estado que el club mueve por su cuenta** (15-sep-2026,
tercera vez que muerde lo mismo). `tests/turnos-marcar.test.ts` usaba a **Dairon** porque "nunca
marca turno"… y el club lo dio de baja. Como `turno_marcar` exige `activo and marca_turno` y la
prueba solo prendía `marca_turno`, **cayeron 13 pruebas de golpe** con "Tu cuenta no registra
turnos", un mensaje que no tiene nada que ver con lo que se probaba. `habilitar()` ahora fuerza
también `activo` dentro de la transacción que se revierte. Ojo al diagnosticar: se confirmó que era
previo guardando los cambios propios con `git stash` y volviendo a correr — fallaban igual.

👥 **Personas y valor de la clase particular, desde el calendario** (15-sep-2026, pedido de la DUEÑA
en video). El club **cobra por persona**: 1 persona $130.000, 2 personas $150.000. Cafetería
(**Camila Arboleda, rol `recepcion`**) es quien registra la clase desde `/clases`, pero **no tiene
acceso a `/cierre`** (`cierre_clase` = N para recepción), que era el ÚNICO sitio donde existía
"¿cuántas personas tomaron la clase?" → le tocaba a la dueña al cerrar, una por una. Sus palabras:
*"no les da para poner que son 2 personas… al que le toca poner que son 2 personas es a mí cuando yo
cierro la clase"*.
- Al **registrar** la reserva (`asignar-paquete.tsx` → `materializarReserva`) hay ahora **Personas**
  junto a **Precio**, y al **corregir** después (`ValorClaseForm` → `editarValorClase`) se editan
  **los dos juntos**. Juntos y no en dos botones a propósito: en el club son la MISMA corrección
  ("vinieron 2, entonces son $150.000"), y separarlos invita a cambiar uno y olvidar el otro.
- **No hubo que tocar `/cierre` ni `liquidacion.ts`**: `/cierre` ya pre-llenaba con
  `clase.num_asistentes ?? 1` y la liquidación ya lee `num_asistentes` para el escalón
  (`nPersonas` → `valorEscalon`, método `escalonado_asistentes`) y `valor_facturado ?? precio` para
  los porcentajes. Lo que faltaba era **quién podía escribirlo**, no el cálculo.
- ⚠️ **El precio ya NO arranca en "0"**: se pre-llena con el `totalAmount` de EasyCancha (el "Monto"
  que el modal ya mostraba de solo lectura). Arrancando en cero, registrar sin escribir nada dejaba
  la clase en **$0** y, con una regla `pct_facturado`, el profesor cobraba $0 — en silencio. Ahora la
  cifra está a la vista para CORREGIRLA de 130.000 a 150.000, que es literalmente lo que pidió.
  ⚠️ Ojo: el monto de EasyCancha es la tarifa de la RESERVA, no la verdad del cobro. Es un punto de
  partida, no un dato firme.
- `num_asistentes` se recorta a **[1, 20]** en el servidor; fuera de rango se guarda null y todo cae
  a 1, que es el comportamiento que ya había.
- ⚠️ El pre-llenado del precio **no tiene prueba de render**: el formulario de `MaterializarReserva`
  solo se pinta tras pulsar "Particular", así que el estado inicial nunca llega al HTML de
  `renderToStaticMarkup`. Lo cubierto es el guardia del servidor. Pruebas en
  `tests/profesor-clase.test.tsx`.

💰 **Corregir el valor de una clase particular** (ago-2026, `editarValorClase` en clases/actions.ts +
`valor-clase-form.tsx`). Se edita desde el **modal de `/clases`**, NO desde `/cierre`: recepción es
quien teclea el precio al registrar la clase y **no tiene acceso a `/cierre`** (`cierre_clase` = N),
así que ponerlo allá habría dejado a quien comete el error sin forma de arreglarlo.
- Escribe **`clases.valor_facturado`**, que ya existía (migración 0015) como **override** y que
  **nadie escribía nunca**: `/cierre` y `liquidacion.ts` ya leen `valor_facturado ?? precio`, así que
  no hubo que tocarlos. `precio` se conserva con lo tecleado al crear → queda el rastro de la
  corrección (y el `audit_log` guarda before/after).
- **Solo particulares** (`tipo = individual` y sin `paquete_cliente_id`): las de paquete derivan su
  valor del paquete y la academia no tiene valor por clase (ver `LineaLiq.valorFacturado = null`).
- **Mismo techo de 24 h que el cierre**, con el mismo helper `instanteClase()`, a propósito: una sola
  regla que recordar ("24 h desde que empezó") en vez de dos parecidas. ⚠️ La primera versión ató el
  permiso al estado `programada`, y **medido sobre las 13 particulares reales eso no servía**: se
  registran y cierran en **10–60 segundos** (13 de 13 ya cerradas), o sea que recepción nunca habría
  alcanzado a corregir nada y todo habría caído en el SA.
- ⚠️ **No hay tabla de liquidación** (se calcula al vuelo), así que NO se puede saber por código si
  una quincena ya se pagó. El plazo de 24 h es el sustituto de ese candado: si algún día se persiste
  la liquidación, el guardia correcto pasa a ser "¿el periodo ya se liquidó?".

## 👤 Perfil y acceso a la plataforma (migración 0060, jul-2026)
**Dos sitios distintos a propósito**: `/perfil` = "mis datos" (cualquier rol) · `/empleados/[id]` =
"administrar al equipo" (solo SA). Mezclarlos habría hecho imposible darle perfil a la coordinadora
administrativa sin darle también la creación de usuarios.
- **`/perfil`**: nombre, teléfono, foto, correo y contraseña propios. Se entra por el avatar del
  encabezado (antes no era clickeable). El rol se muestra pero NO se edita.
- **Crear usuarios ya existía** en `/empleados/nuevo` (Admin API: correo + clave + rol + contrato).
  Lo que faltaba era administrarlos después.
- ⚠️ **`activo = false` NO bloqueaba el ingreso.** Solo escondía a la persona de los selectores; el
  middleware únicamente preguntaba "¿tiene sesión?". Un empleado despedido seguía entrando con su
  clave. Ahora `requireProfile` (que corre en toda pantalla vía `(app)/layout.tsx`) le cierra la
  sesión y lo manda a `/login?bloqueado=1`, y `cambiarAccesoEmpleado` **toca dos sitios**:
  `profiles.activo` (lo que consulta la app) **y** `ban_duration` en Auth (invalida el token de
  refresco, para que la sesión ya abierta tampoco se renueve). Con solo lo primero seguiría navegando
  hasta cerrar el navegador; con solo lo segundo la app no sabría por qué no entra.
- **Trigger `profiles_blindar_rol`**: la política nueva `profiles_update_self` era imprescindible
  (antes solo el SA escribía en `profiles`, así que un profesor no habría podido ni guardar su nombre)
  pero abrirla sin candado dejaba que cualquiera se ascendiera a `superadmin` editando su perfil. El
  trigger prohíbe cambiar `role`/`activo` salvo al SA. Va en trigger y no en la política porque
  comparar contra el valor viejo obligaría a leer `profiles` dentro de su propia RLS (recursión).
  `auth.uid() is null` (service_role) pasa: ese camino ya validó el rol en la server action.
  Verificado con prueba revertida: bloquea ascenso, autobaja y autoreadmisión; deja pasar el nombre.
- **Guardas de "no te dispares al pie"**: el SA no puede cambiarse el rol ni quitarse el acceso a sí
  mismo (hoy es el único, se quedaría fuera para siempre).
- **Foto**: `profiles.avatar_path` (la RUTA, no la URL) + bucket **`avatares` PÚBLICO**, único público
  del proyecto. Es a propósito: el avatar se pinta en el encabezado de todas las pantallas y una URL
  firmada habría que renovarla en cada carga. Escritura restringida a la carpeta propia
  (`<uid>/…`). `next.config.ts` declara el dominio de Supabase para `next/image`. Ojo: al borrar una
  foto el CDN puede seguir sirviéndola unos minutos (comprobado), pero da igual porque la app deja de
  referenciarla y cada foto nueva estrena ruta con timestamp.
- **El correo propio se cambia pidiendo la contraseña actual y aplica de una vez**, sin enlace de
  confirmación al correo nuevo (lo estándar), porque los correos de Auth los manda Supabase y su
  remitente por defecto tiene tope de ~2/hora. Cuando se apunte el SMTP de Supabase a Resend
  (dominio ya verificado), el punto a cambiar es `cambiarMiCorreo` en `perfil/actions.ts`.
- **Recuperar contraseña = el SA la asigna** desde la ficha del empleado. No hay "olvidé mi
  contraseña" en el login por lo mismo del correo.
- ⚠️⚠️ **El login decía "Correo o contraseña incorrectos" ante CUALQUIER fallo** — incluido "la base
  de datos no responde". El **14-sep-2026** Supabase **pausó el proyecto por facturas sin pagar**
  (`status: INACTIVE`, y el host ni siquiera resuelve en DNS: `getaddrinfo ENOTFOUND
  rxkfgbxdxhrirsscvfwe.supabase.co`), y la pantalla acusó a Laura de escribir mal la clave: estuvo
  reintentando y dudando de su contraseña mientras el problema era una factura. **La web de Vercel
  respondía 200** — se cae la base, no el sitio, y desde fuera las dos cosas se ven igual.
  Ahora el mensaje sale de **`mensajeLogin()` en `src/lib/auth/mensajes.ts`**, que separa cuatro
  casos por el `status`/`code` del `AuthError`: sin `status` (nunca hubo respuesta) o 5xx = **problema
  del sistema**, 429 = demasiados intentos, `user_banned` = **cuenta dada de baja** (¡`cambiarAccesoEmpleado`
  banea en Auth, y el baneo se rechaza ANTES de mirar el perfil — al despedido le decía que su clave
  estaba mal!), y solo el resto = clave mala. La lectura de `profiles` que sigue **también mira su
  `error`**: sin eso, con la base caída `perfil` salía null y respondía "esta cuenta ya no tiene
  acceso", que es inventar. Pruebas en `tests/login-mensajes.test.ts`.
  💡 **Regla**: un fallo del sistema y una clave mala se arreglan de formas distintas, así que no
  pueden verse igual. Mismo veneno que ya documenta este archivo tres veces ("leer devuelve 0 filas
  sin error", "una escritura rechazada por RLS no lanza error"), pero de cara al usuario.
  ⚠️ **La causa fue el plan `free` + facturas sin pagar**: restaurar estaba BLOQUEADO hasta saldarlas
  (`PaymentRequiredException`). Laura pagó y **subió Supabase y Vercel a Pro el 14-sep-2026**, así que
  el proyecto ya no se pausa por inactividad. Verificado tras reactivar: `plan: "pro"`,
  `ACTIVE_HEALTHY`, y **9 respaldos diarios** con 7 días de retención (antes la lista salía vacía).
  ⚠️ **`pitr_enabled` sigue en `false`**: Pro trae respaldo DIARIO, no recuperación al minuto — si un
  día se borra algo por error, se puede perder hasta un día de trabajo. El PITR es un añadido que se
  paga aparte; decisión pendiente, no un olvido.
  💡 **Restaurar da un susto que conviene conocer**: el proyecto pasa por `COMING_UP` con la base
  **VACÍA** (0 tablas, 0 usuarios, 9,5 MB) antes de entrar en `RESTORING` y reponer los datos. Vacío
  NO es pérdida: hay que esperar a `ACTIVE_HEALTHY`. **No correr migraciones ni escribir nada durante
  la ventana.** Tardó ~10 min y volvió todo (501 clientes, 5.348 facturas, 100 niños, 42 turnos, y
  las 4 tareas de pg_cron activas).
- ✅ **Los profesores YA ENTRAN y ya cierran sus clases** (medido el 22-sep-2026). Todos tienen su
  correo real; no queda ni un placeholder `vena.digital.2207+profe.…` ni el `test@gmail.com` de Juan
  Cruz. Últimos ingresos: Graciano 22-sep · Jorge 16-sep · Juan Cruz 16-sep · Yeison 15-sep ·
  Sebastián 11-ago · Cristian 4-ago. **Los 4 que dictan academia pueden cerrar**, que es lo que
  sostiene el cierre derivado del planeador.

## ⏱️ Turnos del personal (en construcción · bloque 1 hecho el 26-ago-2026)
Registro de entrada y salida por horas para quien se paga así: **Camila Arboleda** (cafetería, figura
como recepción), **Juan Fernando Gaviria** (coord. admin), **Santiago Montoya** (recepción) y
**Carlos Florez** (vigilante, empleado directo del club). **Los profesores NO marcan** (decisión de Laura).

**Reglas del cálculo** (acordadas con Laura el 25-ago-2026, verificadas contra la norma vigente):
- Semana **lunes a domingo**; máximo **42 h** (Ley 2101 de 2021, desde el 15-jul-2026). Jornada de
  **7 h trabajadas + 1 de almuerzo**, que NO es tiempo trabajado y se marca aparte.
- **Diurna 6:00–18:59 · nocturna 19:00–5:59** (Ley 2466 de 2025 corrió la noche de las 9 a las 7 p.m.).
  ⚠️ Arranca a las **6**, no a las 7 que dictó Laura: el club abre a las 7, pero la ley dice 6 y el día
  que alguien abra a las 6:30 esa media hora tiene que salir bien.
- Una hora es **extra** si pasa de 7 h en el día, de 42 en la semana, **o** cae fuera de la ventana de
  operación (después de las 9 p.m. o antes de las 6 a.m.).
  💡 La regla de las 9 p.m. la pidió Laura y **casi nunca cambia nada**: con jornada de 7 h, el turno
  de la tarde (1–9 p.m.) llega a las 9 p.m. con sus 7 horas justas, así que las dos reglas dicen lo
  mismo. Solo agrega plata cuando alguien entra tarde por un evento y se queda pasadas las 9 habiendo
  trabajado menos de 7 h. Se propuso quitarla y Laura dijo que no; **queda**.
  ⚠️ La objeción que se le hizo (que arruinaría a un vigilante nocturno) **no aplica**: Carlos no es
  nocturno, entra a las 9 a.m. y cierra el club a las 9 p.m. El día que entre alguien con turno de
  noche de verdad, la hora de corte es un parámetro en un solo sitio del SQL.
- **Domingos y los 18 festivos** llevan recargo dominical (90% desde jul-2026) y los recargos se
  acumulan si además es de noche.
- ⚠️ **Carlos hace 12 h diarias** = 11 trabajadas = 4 extras al día. Seis días son ~66 h contra un tope
  de 42, y 24 h extra semanales contra un tope legal de 12. **El reporte lo va a marcar en rojo todas
  las semanas y está bien que lo haga.**
  ✅ **Carlos (Carlos Florez, rol `seguridad`) es EMPLEADO DIRECTO del club, no de una empresa de
  vigilancia** (Laura, 24-sep-2026). O sea que **las horas extra y los recargos los debe el club** y el
  reporte de `/horas` es la base para pagárselos. Medido del 24-ago al 24-sep (22 turnos): la semana del
  31-ago hizo 56,9 h con **24,8 h extra** (más del doble del tope legal de 12 semanales); las demás,
  entre 4,8 y 8,6 h extra. Aún no ha marcado ningún domingo.

**Cómo se marca**: dos puertas, **una sola implementación** (`private.turno_marcar`) — el celular de
cada quien (`turno_marcar`) y el PC de recepción (`quiosco_marcar`, con PIN de 4 dígitos). Foto de la
cara al entrar **y** al salir; sin foto no se marca. Cuatro marcaciones al día: entrada, salida a
almorzar, regreso y salida.
- 🔒 **La hora la pone el servidor, SIEMPRE.** Las tablas no tienen permiso de escritura para nadie;
  se escribe solo por funciones SECURITY DEFINER que estampan `now()`. Si la hora viniera del
  formulario, bastaría con atrasarle el reloj al celular. Todo se guarda en **minutos redondos**, que
  normaliza un trigger (no un CHECK: `date_trunc` sobre timestamptz es STABLE y Postgres no lo acepta
  en un CHECK).
- ⚠️ **Cerrar el turno con el almuerzo abierto está BLOQUEADO a propósito.** Las dos salidas posibles
  están mal: contar la pausa en cero le paga el almuerzo, y estirarla hasta el final del turno le quita
  horas trabajadas. Mejor exigir el dato con la persona ahí parada.
- ⚠️ **`quiosco_marcar` devuelve un ESTADO, no lanza excepción con el PIN malo**, y no es capricho: una
  excepción revierte la transacción y con ella el `update` que suma el intento fallido, así que el
  bloqueo a los 5 intentos nunca se activaría.
- Un turno **abierto aporta CERO horas**: no se inventa la hora de salida. Sale en rojo y lo corrige el
  superadministrador (`turno_ajustar`, `turno_crear_manual`, `turno_eliminar`, `turno_pausa_fijar`),
  siempre con motivo obligatorio y rastro en `audit_log`.

👀 **El coordinador administrativo VE el reporte, pero no corrige** (9-sep-2026, migración 0088).
`turnos_reporte` pasa a **L** para `coord_admin` y las políticas `turno_select`, `turno_pausa_select` y
`turnos_obj_select` (las fotos, que Laura decidió que también viera) admiten ahora superadmin **o**
coord. administrativo. Corregir no se movió: las cinco funciones de corrección siguen pasando por
`private.turno_exige_sa()`.
- **Quién corrige vive en `PUEDE_CORREGIR_TURNO` (src/lib/turnos.ts)**, no en la matriz: es regla de
  DENTRO del módulo, como `PUEDE_REABRIR_EVENTO`. De ahí beben la server action y el gateo de los
  botones — una sola lista para las dos capas, que es lo que evita esconder el botón y olvidar la
  acción (o al revés).
- ⚠️ **Consecuencia conocida y aceptada: Juan Fernando es coord. administrativo Y uno de los cuatro
  que marca**, así que ahora ve su propio acumulado y el de sus compañeros — justo lo que 0083 le
  cerró a los empleados. Se le advirtió a Laura antes de aplicarlo y decidió seguir: los permisos son
  por ROL, y dárselo a Sebastián y no a Juan exigiría excepciones por usuario (descartado desde 0068).
- 💡 Tercera vez que `turnos_horas`/`turnos_listar` siendo SECURITY INVOKER ahorra trabajo: el cambio
  de política las alcanzó solas.

⚠️⚠️ **DOS LECCIONES DE PRUEBAS que salieron al aplicar esto, y las dos son del tipo "solo falla
cuando ya hay datos reales"** (9-sep-2026; el módulo lleva en uso desde el 27-ago y hay 31 turnos):
1. **Nueve pruebas preguntaban "¿cuántos turnos tiene esta persona?"**, que con la tabla vacía era lo
   mismo que "¿cuántos acabo de crear?". Con datos reales daban 8 donde esperaban 1 y cayeron todas a
   la vez. Ahora cada una toma un **corte de `max(id)`** al abrir la transacción y solo mira lo suyo.
2. **Ninguna prueba que ABRA un turno puede usar a alguien que marque de verdad.**
   `turno_abierto_uidx` permite UNO abierto por persona, así que la prueba reventaba con "duplicate
   key" **según la hora del día** — el peor tipo de fallo. Las pruebas de base ahora usan a **Dairon**
   (profesor que nunca marca; el interruptor se le prende dentro de la transacción), y
   `horas-render.test.tsx` **dejó de sembrar el turno abierto**: esa detección se prueba sobre
   `revisar()`, que es donde vive la lógica, sin tocar la base.

🔒 **El empleado NO ve cuántas horas lleva** (decisión de Laura, 26-ago-2026, migración 0083).
Su pantalla marca y nada más: ni el acumulado de la semana, ni la clasificación del día, ni el
histórico. Va en la BASE y no solo en la pantalla, que es la lección que este proyecto ya aprendió
tres veces (el dashboard, `cerrarClase`, `/config`): quitarlo del menú lo esconde, no lo cierra.
`turno_select` quedó en **superadministrador, o su propio turno ABIERTO** — lo abierto es lo mínimo
para que la pantalla sepa si ofrecer "Iniciar" o "Cerrar" y si hay un almuerzo sin regreso; al
cerrarlo, la fila deja de ser suya de ver. 💡 No hizo falta tocar `turnos_horas`/`turnos_listar`
justamente porque son SECURITY INVOKER: el cambio de política las alcanzó solas, sin un segundo
guardia que se pueda desactualizar. Verificado: con su sesión, un empleado ve **0 turnos** y
`turnos_horas` le devuelve **0 minutos**.
⚠️ El dato sigue existiendo completo y Laura lo ve en su reporte; si un empleado pregunta por sus
horas, se le muestran desde ahí.

**El cálculo va minuto a minuto** (`turnos_horas`, migración 0081) y devuelve **minutos por persona y
por DÍA**, con 8 baldes. Se hace así porque las fórmulas de "restar horas" obligan a resolver a mano el
turno que cruza las 7 p.m., el que cruza la medianoche del domingo al lunes y —el peor— el instante
exacto en que se cumplen las 42 h a mitad de hora. El volumen es ridículo: una quincena de 4 personas
son ~20.000 minutos. Va por día y no por semana para que el reporte sume cualquier periodo sin
recalcular. ⚠️ El contador de 42 h se cuenta desde el **lunes de cada semana tocada**, aunque `p_desde`
caiga a mitad de semana; sin eso, pedir "del 12 al 20" reiniciaría el contador y las extras saldrían
de menos. La función es **SECURITY INVOKER a propósito**: así la RLS filtra sola (cada quien lo suyo,
el SA todo) y no hay un guardia a mano que se desactualice.

**Dos roles nuevos** (migración 0078): **`seguridad`** (Carlos) y **`quiosco`** (NO es una persona: es
el PC de recepción, con la sesión abierta todo el día en la pantalla de marcar).
- ⚠️ Son los primeros roles **sin ningún módulo**, y eso rompía `rutaInicio()`, que mandaba a todo el
  que no es SA a `/notas` — habrían quedado rebotando sin poder entrar a ninguna parte. Ahora
  `seguridad` cae en `/turnos` y `quiosco` en `/quiosco`.
- **Quién marca lo dice `profiles.marca_turno`, persona por persona**, no el rol: los cuatro son de
  roles distintos y marcar turno es una condición del contrato, no un módulo. Lo blinda el trigger
  `profiles_blindar_rol` (junto con `role` y `activo`): si cualquiera pudiera apagárselo desde "Mi
  perfil", desaparecería de la nómina por horas sin que nadie lo note.

⚠️⚠️ **HALLAZGO GRANDE — en Supabase "no dar grants" NO cierra nada** (migración 0082). El proyecto
trae `alter default privileges … grant all on tables to anon, authenticated`, así que **toda tabla
nueva del esquema público nace con SELECT/INSERT/UPDATE/DELETE para `anon` y para `authenticated`**.
Medido: las cuatro tablas de este módulo tenían los siete privilegios para los dos roles. En la
práctica nadie escribía, porque la RLS sin políticas de escritura ya niega, pero dejaba la tabla de
NÓMINA defendida por una sola capa (un `disable row level security` de más la abría), y a `turno_pin`
"protegida" solo porque **RLS sin políticas devuelve CERO FILAS, no un error** — una política de
lectura puesta por descuido habría publicado los hash de los PIN, que con 4 dígitos se revientan en
milisegundos. **Al crear una tabla sensible: `revoke all … from anon, authenticated` explícito y
devolver solo lo que hace falta.**

**Fotos**: bucket privado **`turnos`** (a diferencia de `avatares`, que es público). La foto de una
cara es dato sensible (Ley 1581) → enlaces firmados y **borrado automático a los 45 días** (Laura,
26-ago-2026; antes eran 30). Se borra
la foto; **el registro del turno se conserva siempre**, porque es la prueba de nómina. Hay que hacerles
firmar autorización de tratamiento de datos: eso es del club, no del software.

**Festivos** (migración 0079): tabla `festivo` con fechas ESCRITAS hasta 2032, generadas por
`scripts/festivos-colombia.mjs`. ⚠️ **No siempre son 18**: en 2030 hay 17, porque el 29 de junio cae
sábado y San Pedro se corre al lunes 1 de julio, que es justo el Sagrado Corazón — ese choque tumbó la
primera versión de la migración. ⚠️ Cuando se acaben (2032) el cálculo **no falla**: deja de reconocer
festivos y esas horas se pagan como día normal, en silencio.

**Pruebas**: `tests/turnos-horas.test.ts` (16, la matemática, incluido el ejemplo exacto que dictó
Laura: llega el domingo con 38 h y hace 7 → 4 dominicales + 3 dominicales extra) y
`tests/turnos-marcar.test.ts` (18, las dos puertas, las correcciones y quién ve qué).
⚠️ **En las pruebas de rechazo hay que usar SAVEPOINT**: en Postgres un error deja la transacción
abortada y toda sentencia siguiente responde "current transaction is aborted" — sin savepoint, la
primera prueba de rechazo tumbaba en cascada a las diez siguientes y los mensajes de fallo no tenían
nada que ver con lo que se estaba probando.

✅ **Pantalla `/turnos` lista** (bloque 2, 26-ago-2026). Un solo trabajo: marcar. La cámara se abre
con `getUserMedia({facingMode:"user"})`, se recorta cuadrada desde el centro a 640 px y se manda en
JPEG 0.82 (~60 KB) por Server Action. El **visor va espejado** (CSS) porque es lo que uno espera al
verse, pero **la foto se guarda sin espejo**: es la imagen real.
- ⚠️ La cámara **solo funciona sobre HTTPS** (o localhost). Si `navigator.mediaDevices` no existe se
  distingue entre "no es seguro" y otros fallos, y cada caso se explica distinto: bloqueada (con los
  pasos para desbloquearla), sin cámara, ocupada, insegura. Todas ofrecen la misma salida: el PC de
  recepción.
- ⚠️ **`VistaCamara` y `VistaFallo` se separaron a componentes exportados a propósito**: dentro del
  componente grande solo se alcanzan tocando un botón, así que un error ahí no lo habría visto nada
  —ni `tsc`, ni el build, ni la prueba de render— hasta que alguien fuera a marcar de verdad. Ahora
  `tests/turnos-render.test.tsx` las monta con props.
- La entrada del menú **"Mi turno" se filtra por PERSONA, no solo por rol**: `NavItem.requiere =
  "marca_turno"`, alimentado por `profiles.marca_turno`, que se agregó al perfil que carga
  `(app)/layout.tsx`. El rol dice si la pantalla existe; el interruptor dice quién marca.
- Se usa **`refresh()` de `next/cache`** (Next 16) tras marcar, en vez de `revalidatePath`: es lo que
  la documentación indica para "refrescar la pantalla actual después de una mutación". ⚠️ Hay que
  agregarlo al `vi.mock("next/cache")` de las pruebas o la pantalla ni se importa.
- Helpers nuevos en `src/lib/fecha.ts`: `horaCorta` ("7:02 a. m."), `fechaLarga` ("martes 26 de
  agosto") y `saludo`. Se arman a mano por lo mismo que `fechaHoraCorta` — se pintan en un componente
  de cliente y servidor y navegador tienen que producir los mismos caracteres exactos.
- 💡 **Cómo se verificó el diseño sin poder iniciar sesión**: se renderizó el componente con
  `renderToStaticMarkup` inyectando el CSS ya compilado de `.next/static/chunks/*.css` en una página
  suelta. Sirve para MIRAR una pantalla con sesión obligatoria sin inventar credenciales.
- ⚠️ Al medir: **no correr `npm run build` y `npm test` a la vez.** Las pruebas contra Postgres tienen
  20 s de tope y con el build compitiendo por CPU se cayeron tres archivos con 38 pruebas saltadas;
  en tres corridas limpias seguidas pasan las 58.

✅ **Reporte `/horas` listo** (bloque 4, 26-ago-2026). Solo superadministrador. Periodo mes/quincena,
el MISMO selector de la liquidación porque las dos pantallas son nómina (`rangoNomina` se movió de
`liquidacion.ts` a `periodo.ts` para no dejar dos copias). Tabla por empleado con las seis columnas,
tarjeta de avisos arriba, y detalle por persona en `/horas/[id]` con la composición, el desglose
semana a semana y el turno por turno con sus fotos (enlace firmado; el bucket es privado).
- 💡 **No hay total general, y es decisión de Laura** (26-ago-2026): sumar las horas de las cuatro
  personas da un número que nadie usa —no se le paga a nadie "el total del club"— e invita a comparar
  cifras que no son comparables. El total que importa es el de CADA persona, contra sus 42 h
  semanales. Hay una prueba que lo fija (cuenta las filas de la tabla).
- ⚠️ **El detalle parte la quincena en SEMANAS**, aunque no cuadren: el tope de 42 h es semanal y la
  nómina quincenal. Es la única forma de ver si alguien se pasó, y de que se note cuándo una semana
  quedó cortada por el corte de nómina. Funciona porque `turnos_horas` devuelve por DÍA ya
  clasificado: sumar días 16–31 es exacto aunque el periodo parta una semana por la mitad.
- ⚠️ **En `corregirTurno` el ORDEN de los tres pasos no es intercambiable**: borrar pausas → ajustar
  el turno → volver a poner el almuerzo. Al revés se traba solo, porque `turno_ajustar` rechaza dejar
  una pausa fuera del turno y `turno_pausa_fijar` rechaza una pausa fuera del turno ACTUAL; con las
  dos validaciones vivas, encoger un turno con almuerzo sería imposible.
- ⚠️ Si la salida es anterior a la entrada se toma como del DÍA SIGUIENTE. Hoy nadie cruza la
  medianoche, pero sin esa regla la base rechazaría el ajuste sin que se entienda por qué.
- Los ceros salen como raya gris: en una quincena normal todo es diurno y, si las seis columnas
  gritaran igual, lo único que hay que mirar se perdería entre ceros.
- La prueba `tests/horas-render.test.tsx` **siembra turnos** (2027, para no cruzarse con datos
  reales) y comprueba las CIFRAS, no solo que la página abra; los borra en un `finally` y verifica
  que no quedó ninguno.

✅ **Interruptor y PIN en la ficha del empleado** (26-ago-2026, migración 0084). Tarjeta "Registro de
horas" en `/empleados/[id]`, solo superadministrador. Dos cosas separadas a propósito: el
**interruptor** decide si la persona marca; el **PIN** es solo para la segunda puerta (el PC de
recepción) y sin él sigue marcando desde el celular con normalidad.
- ⚠️ `turno_pin` no la lee NADIE, ni el SA. Para poder pintar "Asignado / Sin PIN" se agregó
  **`turno_pin_estado(p_perfil)`**, que devuelve un booleano y nunca el hash, más
  `turno_pin_borrar`. Efecto secundario del arnés de pruebas: con service_role, `private.user_role()`
  es null y la función lanza excepción — supabase-js la devuelve como `error` y la pantalla pinta
  "Sin PIN" sin reventar. Es del arnés, no de la app.
- Al prender o apagar el interruptor se revalida el layout entero: la entrada "Mi turno" del menú
  depende de `profiles.marca_turno`.

📷 **La foto se abre en grande al tocarla** (`horas/foto-turno.tsx`): con 32×32 en la tabla no se
reconoce a nadie. La miniatura es un botón y el modal muestra la foto a tamaño completo con quién,
qué día y a qué hora.
- ⚠️ Va con `<img>` y NO con `next/image`: el bucket `turnos` es privado, la foto se sirve con enlace
  firmado (`/storage/v1/object/sign/…`) y `next.config.ts` solo declara el dominio de Supabase para
  `/public/**`.
- ⚠️ **El contenido del modal no se puede probar con `renderToStaticMarkup`.** Se intentó sacarlo a un
  componente propio, como se hizo con `VistaCamara`, y NO funciona: `DialogTitle` y
  `DialogDescription` de Base UI exigen el contexto del diálogo ("Cannot destructure property 'store'
  of 'useDialogRootContext(...)'") y el portal no se pinta en servidor. Se revirtió la extracción para
  no dejar indirección que no compra nada. Lo que sí se prueba es el botón que lo abre y el hueco de
  "sin foto".

⚠️ **`turno.origen` NO dice el aparato, dice la PUERTA.** `app` = marcó con su propio usuario, desde
donde sea (celular, portátil o el PC); `quiosco` = marcó en la pantalla compartida con su PIN; `ajuste`
= lo escribió el superadministrador. La columna se llamaba "Marcó en" y decía **"su celular"** para
`app` — Laura marcó desde su computador y la pantalla le dijo que había sido desde el celular
(26-ago-2026). Ahora dice **"Cómo marcó" · "Con su usuario" · "Quiósco de recepción"**, y el pie lo
aclara. **La base no guarda el aparato y no hace falta**: lo que importa para nómina es si marcó la
persona, el quiósco o el administrador.

⚠️ **Las pruebas que ESCRIBEN filas de verdad tienen que usar personas distintas.**
`tests/horas-render.test.tsx` siembra un turno ABIERTO y `turno_abierto_uidx` impide dos por persona,
así que chocaba con `turnos-marcar`/`turnos-horas` —que usan a Santiago— con "duplicate key value
violates unique constraint". **Solo se veía al correr la suite completa**: archivo por archivo,
verde. Ahora esa prueba usa a Juan y limpia lo suyo antes de sembrar.

✅ **Quiósco listo** (bloque 3, 26-ago-2026, migración 0085). `/quiosco`, **fuera del grupo `(app)`**
para que no herede menú ni encabezado: es un aparato de una sola función, no una pantalla más. La abre
la cuenta con rol `quiosco` (y el SA, para probar).
- **El orden es nombre → acción → PIN → foto.** El PIN se pide DESPUÉS de escoger la acción: se teclea
  una sola vez y justo antes de que sirva. El estado de cada quien sí se ve antes (no es secreto) y es
  lo que le confirma a la persona que tocó su tarjeta.
- ⚠️ **`quiosco_pin_verificar` existe para fallar TEMPRANO.** Con solo `quiosco_marcar` —que valida y
  marca en el mismo paso— un PIN malo se descubriría después de tomarse la foto: confuso, y encima
  deja el archivo subido para nada. Se partió en dos pero con **una sola implementación**
  (`private.quiosco_pin_check`), que `quiosco_marcar` vuelve a llamar: saltarse la verificación desde
  el navegador no sirve de nada. Hay prueba que lo fija.
- El mensaje dice **cuántos intentos quedan** antes del bloqueo de 15 min: que a alguien se le cierre
  la puerta sin entender por qué es peor que el PIN malo.
- Quien no tiene PIN sale en la lista **inhabilitado y con la salida escrita** ("marca desde tu
  celular"), en vez de dejarlo tocar y darle un error.
- La foto va a la carpeta de la PERSONA, no a la del quiósco: así vive con sus turnos y el reporte la
  encuentra igual que las del celular.
- **Vuelve sola a la lista** a los 45 s de inactividad y 3,5 s después del "listo": es una pantalla
  compartida y no puede quedarse con un PIN a medio escribir.
- ⚠️ **El reloj no se pinta en el servidor.** Servidor y navegador no marcan el mismo segundo, y
  pintarlo en SSR descartaría la hidratación del árbol entero — el mismo fallo que documenta
  `fecha.ts`. Arranca vacío y se llena al montar; hay una prueba que lo fija.

✅ **Las fotos se borran solas al mes** (bloque 5, 26-ago-2026, migración 0086). Edge Function
`turnos-limpiar-fotos` + pg_cron a las **07:40 UTC = 02:40 a. m. en Bogotá**, con el club cerrado.
⚠️ **El plazo son 45 días y vive en UN solo sitio**: el valor por defecto de `turno_fotos_vencidas`
(migración 0087). La tarea la llama **sin parámetro** justamente para que no haya un segundo número.
Lo único que hay que mantener a la par es el TEXTO que ve la gente (`FOTOS_DIAS` en
`src/lib/turnos.ts`), y las dos constantes se apuntan la una a la otra. Hay una prueba que fija el
valor por defecto.
Se borra LA FOTO; **el registro del turno se conserva siempre**, porque es la prueba de nómina.
- **La decisión de QUÉ borrar vive en SQL** (`turno_fotos_vencidas` / `turno_fotos_olvidar`) y no
  dentro de la tarea: así se puede probar de verdad. La tarea solo hace lo que en SQL no se puede —
  borrar el archivo del almacenamiento.
- ⚠️ **EL ORDEN NO ES INTERCAMBIABLE**: listar → borrar los archivos → limpiar las rutas. Al revés
  —olvidar primero— un borrado fallido dejaría archivos huérfanos PARA SIEMPRE, porque nadie volvería
  a saber que existen. Así, si falla el último paso, la corrida de mañana los vuelve a ver, intenta
  borrarlos (ya no están, no pasa nada) y limpia las rutas: **se arregla solo**.
- El plazo se mide desde `coalesce(fin_el, inicio_el)`: con el turno cerrado manda la SALIDA, que es
  la foto más nueva, para no borrar la de entrada antes de que la otra cumpla el mes. Un turno que
  quedó ABIERTO se mide por su entrada y pierde su foto igual — la política es la política, y ese
  turno lleva saliendo en rojo en el reporte desde el primer día. Hay pruebas de los tres casos.
- Verificado de punta a punta: se sembró una foto real de hace 40 días, se invocó la tarea como lo
  hace el cron (`{"ok":true,"vencidas":1,"borradas":1,"olvidadas":1}`), el archivo desapareció, la
  ruta quedó en null, el turno siguió vivo y **las 10 fotos reales del día no se tocaron**.

## Pendientes conocidos

### 📌 Lista vigente (revisada con Laura el 24-sep-2026 — ESTA es la lista; lo de abajo es historia)
**Datos que tiene que pasar el club**
1. **Matías y Elena Restrepo** comparten el documento 1017204187 (fichas m584 / m428, ficha 430):
   de quién es, y el real del otro. Matías (4 años) debería ser RC, no TI.
2. **Valentín Ramírez** (m92) tiene la TI de su hermano Clemente (1037607268) y no tiene nacimiento.
3. **Salomón Agudelo** (ficha 572): faltan su documento y su fecha de nacimiento.
4. **9 fichas con nombre repetido** sin nada en común (Andrés Zapata, Daniel Uribe, Diego Chalarca,
   Enrique Mateus, Isaak Ruiz, Jorge Moreno, Laura Restrepo, Manuel Mejía, Santiago Correa).
5. **8 cédulas de adultos en conflicto** con EasyCancha (`docs/cedulas-en-conflicto.md`).

**Decisiones / tareas de Laura**
6. **Catálogo estándar de paquetes** (Laura levanta la info con el club).
7. **Rotar las claves** de Supabase (PAT) y Siigo (access_key) que se compartieron en el chat.
8. **Respaldo al minuto (PITR)** de Supabase: hoy es diario; se paga aparte. Decidir.

**Construir / revisar (agente)**
9. **Correo de "olvidé mi contraseña"**: apuntar el SMTP de Supabase a Resend.
10. **Facturas de torneo fuera de la ventana**: revisar con los torneos ya corridos si hace falta el
    buscador por número de factura en la ficha del evento.
11. (Limpieza técnica, sin prisa) retirar `profesor_valor_clase` / `profesor_compensacion`.

**Cerrados el 24-sep-2026 (no reabrir):** reglas de Mauricio · Carlos es empleado directo · colegios
de 1 hora · clase 400 a $50.000 es correcta · particulares anteriores al 15-sep revisadas · audit de
reglas · aviso de profesor sin reglas (lo hace Laura) · cruce academia–Siigo (descartado) · vigencia
de las reglas · formulario de cliente (facturación + acudiente) · datos de Simón Mejía Cadavid.

### Historia de los pendientes
- 📅 **Semana del 10-ago-2026 — revisar la ventana de candidatas con el torneo del 7-8 de agosto ya
  corrido.** Se aplazó a propósito para medir el comportamiento real en vez de construir a ciegas.
  Dos preguntas: (a) ¿la ventana −5/+10 capturó todas las facturas del torneo?, (b) ¿hace falta el
  buscador por número de factura para atar las que caigan fuera? El club dice que los pagos entran el
  día del torneo, así que lo esperable es que sí alcance.
- Rotar tokens expuestos en chat: PAT de Supabase y access_key de Siigo (Laura debe regenerarlos).
- **Apuntar el SMTP de Supabase a Resend** → habilita enlace de "olvidé mi contraseña" y confirmación
  al cambiar de correo. Hoy ambos flujos van por el SA.
- ✅ **Correos de los profesores: LISTO** (verificado 22-sep-2026). Todos tienen el suyo y todos han
  iniciado sesión al menos una vez, Juan Cruz incluido.
- ✅ **Reglas de pago de Yeison Bedoya — APLICADAS** el 16-sep-2026 (ver su tabla de franjas arriba).
  Con esto **los 9 entrenadores activos tienen reglas**; ya no queda nadie liquidándose en $0 por no
  estar configurado.
  ✅ **Después de las 9 p. m. no dicta: el club cierra a las 9** (Laura, 24-sep-2026). No hace falta
  banda; si algo cae ahí, la regla 54 lo muestra con nombre. **Los domingos tampoco dicta después de
  la 1 p. m.** (Laura, 24-sep-2026): mismo criterio, sin banda; la 54 es la red.
- ✅ **RESUELTO el 24-sep-2026 con la VIGENCIA de las reglas** (ver "📅 Vigencia de las reglas"):
  desde ese día, un cambio solo mueve la liquidación desde el mes elegido. Lo de abajo sigue siendo
  cierto para los cambios ANTERIORES a esa fecha, que ya estaban aplicados:
- ⚠️⚠️ **Cambiar una regla REESCRIBÍA el pasado en pantalla.** La
  liquidación se calcula al vuelo y **no se persiste** (ya está dicho más arriba a propósito de las
  24 h), así que tocar `profesor_regla` hoy cambia también lo que la pantalla muestra para meses ya
  pagados. Pasó el 16-sep-2026 con los tres cambios de nómina: a Graciano agosto le subió de
  $2.164.996 a $2.219.996, y a Cristian agosto y septiembre le pasaron de $485.000 y $710.000 a
  $3.500.000. **Laura revisó y confirmó que los pagos ya hechos estaban correctos y NO se ajustan**
  (16-sep-2026) — o sea que para esos meses la pantalla y lo que de verdad se pagó **no cuadran, y
  está bien**. No "arreglar" esa diferencia ni proponer un backfill.
  💡 Es el argumento más fuerte a favor de **persistir la liquidación** el día que se retome: hoy no
  existe forma de saber por código qué se pagó de verdad, solo qué se pagaría con las reglas de hoy.
- 📅 **Vigencia de las reglas de pago** (migraciones `20260924160000_reglas_vigencia` y
  `20260924161000_reglas_orden_contiguo`, 24-sep-2026, pedido de Laura: *"si cambian las reglas,
  que cuente desde el mes en que se aplicó el cambio"*).
  · `profesor_regla.vigente_desde` / `vigente_hasta`. **Cada clase se paga con la regla vigente EL
    DÍA de la clase**; salario y % de Siigo, con la vigente el primer día del periodo (los cambios
    arrancan siempre un día 1 y el periodo nunca cruza de mes, así que da lo mismo).
  · Qué significa cada fila: `activo` = juego ACTUAL (lo que se ve y edita; puede arrancar en un mes
    futuro) · `activo=false` + `vigente_hasta` = versión VIEJA que sigue pagando los meses que cubrió
    · `activo=false` sin `vigente_hasta` = apagada antes de existir la vigencia (Joaquín 7 y 8,
    Cristian 11 y 12, Juan 31): **no cuenta en ningún mes**, igual que antes. Por eso "está activa"
    ya NO es lo mismo que "paga": la liquidación filtra con `cuentaEnLiquidacion` + `vigenteEl`
    (`src/lib/reglas-vigencia.ts`), y los demás lectores (`staff_docentes`, planeador, ficha) siguen
    con `activo`, que es lo correcto para "¿qué reglas tiene hoy?".
  · **Guardar desde la ficha ya no borra y reescribe.** Pide "¿Desde qué mes aplican los cambios?"
    (por defecto el mes actual) y `planGuardarReglas` decide: lo idéntico se queda quieto (mismo id);
    lo que cambia se CIERRA el último día del mes anterior y entra de nuevo desde el día 1; lo que
    arrancaba ese mes o después se BORRA (nunca pagó antes). Se aplica en UNA transacción con el RPC
    `profesor_reglas_aplicar` (SECURITY INVOKER: la RLS SA/CA decide) — antes eran dos llamadas y si
    la segunda fallaba el profesor quedaba sin reglas.
  · ⚠️ **El ORDEN cuenta como cambio**: reordenar cierra y vuelve a crear, porque el orden decide
    cuál gana (el sábado de Graciano). Por eso la migración 20260924161000 dejó el `orden` sin
    empates (0..n-1 por profesor; había empates en Graciano, Jorge y Sebastián, entre reglas que no
    se pisan, así que no movió plata). La liquidación ordena por `orden, id`.
  · **Mes pasado = corrección**: se puede elegir, la pantalla avisa en ámbar, y recorta también las
    versiones viejas que se crucen para que nunca paguen dos reglas la misma clase.
  · Las existentes arrancan el **1-jun-2026** (inicio de la historia), así **ninguna cifra ya mostrada
    se movió** — verificado comparando la liquidación jun–oct (mes, q1 y q2) antes y después, línea
    por línea. La única diferencia fue a propósito: **Mauricio Calderón** arranca el **1-sep-2026**
    (entró en septiembre), así que ya no sale cobrando $5.000.000 en junio–agosto.
  · La ficha muestra "Paga desde el 1 de …" en las reglas que no arrancan en junio, y un plegable
    **"Reglas anteriores"** con las versiones cerradas y su rango de fechas (solo lectura).
  · 🐛 **De paso, un error que ya existía**: `guardarReglas` solo guardaba `servicio_id` en las
    reglas de % de Siigo, así que **guardar desde la ficha borraba el "¿Qué academia?"** (agregado
    ese mismo día): la regla de Recreativa de Leo habría vuelto a pagar $90.000 también en sus clases
    de Competencia. Ahora se guarda también en las reglas de academia.
  · Prueba: `tests/reglas-vigencia.test.ts` — la lógica sola y un recorrido de punta a punta sobre
    Dairon (profesor inactivo, sin clases): $1M desde agosto → $2M desde octubre → corrección a $3M
    desde septiembre; agosto nunca se mueve y octubre nunca queda con dos salarios. Deja sus reglas
    como estaban y lo comprueba.
- ✅ **Sebastián Niño Mora: la academia va dentro de su salario** (Laura, 24-sep-2026) → regla
  "Academia · cubierta por salario fijo" en $0. Y **SÍ cuentan para su tope de 140** (Laura,
  24-sep-2026): es justo lo que ya hace `comision_umbral`, que cuenta todas las clases realizadas del
  mes sin mirar el tipo. No cambiar ese conteo. Tiene salario fijo + "Comisión desde la clase 141"
  (`comision_umbral`, concepto `clase` = comodín), y el comodín **sí casa con academia**
  (`liquidacion.ts`, `r.concepto !== "clase"`). Pagan $0 igual —la academia no tiene valor
  facturado—, pero `comision_umbral` cuenta **TODAS** las clases realizadas del mes sin mirar el tipo,
  así que sus ~38 de academia al mes le acercan el umbral a las particulares. **Hoy no mueve plata**:
  38 de academia + ~7 particulares = ~45, lejos de 140. Decisión pendiente para cuando se retome
  nómina: (a) darle la regla "Academia · cubierta por salario fijo" en $0 como a los otros tres, y
  (b) decidir si la academia debe contar para el tope. La (a) sola NO arregla la (b).
- ⚠️ **Dos niños quedaron con el DOCUMENTO DE SU HERMANO** (23-sep-2026), que es el error que traía
  el Excel: **Valentín Ramírez (m92) tiene la TI `1037607268` de Clemente (m371)**, y **Matías
  Restrepo (m584) la `1017204187` de Elena (m428)**. Un documento es de una sola persona: así, una
  factura de Siigo o una reserva que llegue con ese número no sabe de cuál de los dos es. Hay que
  pedir los documentos REALES. Además a Valentín le falta la fecha de nacimiento, y Matías (nacido
  en 2022, 4 años) figura como TI cuando a esa edad en Colombia es RC — otra señal de que se copió.
  Ya están matriculados igual: el importador cruza documento Y nombre.
- ✅ **"Mauricio" es Mauricio Calderón, profesor de tenis** (perfil creado por el club el 23-sep).
  Se le marcó tenis y se le creó el alias de EasyCancha `mauricio` (ya son 11).
  💼 **Reglas de pago: SALARIO FIJO PURO de $5.000.000 mensuales, todo incluido** (Laura,
  24-sep-2026): ninguna comisión, ni por clase ni por academia. Mismo esquema que Cristian Castro:
  "Salario fijo" (id 62) + "Academia · cubierta por salario fijo" $0 (id 63) + "Clases · cubiertas
  por salario fijo" $0 (id 64, comodín `clase`), para tapar los dos frentes. Insertadas por SQL con
  rastro en `audit_log` (id 1769). Al cargarlas no tenía ninguna clase registrada.
- D3 · catálogo estándar de paquetes (Laura levanta info con el centro).
- Retirar `profesor_valor_clase` / `profesor_compensacion` cuando se confirme que nadie vuelve al
  modelo viejo de pagos a profesores (hoy TODOS los entrenadores están migrados a reglas).
