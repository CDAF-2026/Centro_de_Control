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
| **Pruebas (verificar SIEMPRE antes de commit)** | `npm test` — incluye `tests/academias-render.test.tsx`, que RENDERIZA las páginas de verdad. ⚠️ **El build NO sustituye a esto**: ver abajo |
| **Migraciones** | `npm run db:apply` (Management API/HTTPS con PAT en .env). ⚠️ `db:push` NO sirve desde el agente (Postgres directo es IPv6-only) |
| Sync facturas Siigo (manual) | `npm run sync:siigo` (`--full` reimporta desde 2026-06-01) |
| **Refrescar solo el catálogo de productos** | `npm run sync:productos` (`-- --dry` para simulacro). Úsalo cuando el club renombre un grupo en Siigo: el sync completo solo refresca este caché si encuentra facturas nuevas, y con el rezago de ~1 día puede pasar medio día sin hacerlo |
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
  pantalla de la primera. Solución: **`evento_facturas_candidatas(p_evento)`** (mismo servicio,
  ventana **−5/+10 días**, `evento_id is null`, **sin filtrar por estado_conciliacion**; trae `n_candidatas`/
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
  ⚠️ Esteban y Jorge dan academia con **salario fijo**: tienen regla explícita `academia` /
  `fijo_por_clase` en **$0** llamada "Academia · cubierta por salario fijo" (ids 25 y 26, insertadas a
  mano en la BD, no en migración). No cambia el pago —ya era $0 por no casar ninguna regla— pero la
  liquidación ahora dice POR QUÉ: antes "$0 porque va en su salario" y "$0 porque falta configurar la
  regla" se veían idénticos, así que un olvido era invisible. Regla general: **todo el que dé academia
  necesita regla de academia, aunque sea en $0.**
  ⚠️ **El ROL dice qué ve; las REGLAS dicen cómo se le paga.** Eran la misma respuesta (`role =
  'profesor'`) y se rompió con **Willington**: es **coordinador deportivo** y además dicta las clases
  de 7 a.m., con salario fijo $4M + comisión 50% ya configurados. Al pasarlo a coordinador (jul-2026)
  desapareció de la liquidación —sus dos reglas no se calculaban, en silencio— y de los selectores de
  profesor, así que sus clases ni siquiera se le podían asignar. Arreglado en dos sitios:
  · `liquidacion.ts` → `esDocente()`: entra quien tenga rol profesor **O** reglas activas **O**
    compensación vieja. Es **aditivo a propósito**: quien tenga rol profesor sin reglas sigue saliendo
    (en $0 visible) en vez de desaparecer.
  · pickers → RPC **`staff_docentes(p_solo_activos)`** (migración 0061), que usan `profesoresActivos`
    y `profesoresParaFiltrar`. Va como función NUEVA y no como parámetro de `staff_directorio` para no
    hacer DROP+CREATE de una firma que ya usan cinco pantallas. SECURITY DEFINER porque
    `profesor_regla` guarda sueldos y recepción no puede leerla: la función la consulta por dentro y
    devuelve solo id/nombre/rol/estado. Verificado desde una sesión de recepción — ve **0 reglas** y
    **8 docentes**. **TODOS los entrenadores activos están migrados** al modelo de
  reglas (Leo, Joaquín, Dairon, Cristian, Willington, Esteban, Sebastián, Jorge); nadie usa ya el modelo
  viejo, pero `profesor_compensacion`/`profesor_valor_clase` quedan como respaldo/tumba. **Pickers de
  profesor filtran por `activo`** (clases/eventos/academias). Esteban tiene comisión 50% en 2 franjas
  (07:00 y 13:00, lun–sáb) = 2 reglas.
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
  filas** (1 y 5).

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
  contraseña, reabrir un evento y cerrar una clase vencida.
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

## 🔄 Rediseño de Academias (decidido con el club el 29-jul-2026 · en construcción)
**Ya hecho** (migración 0053): `academias.categoria` (recreativa|competencia, CHECK) +
`academias.servicio_id` → `servicios`. Existen las **4 fijas** (`ACA-2026-TEN-REC/TEN-COM/PAD-REC/
PAD-COM`) atadas a su grupo de producto de Siigo, y se borraron las 11 viejas (cascada se llevó sus 46
clases y 1 inscripción; 0 asistencias, nada que perder). Formularios de nueva/editar academia
simplificados: solo nombre, deporte, categoría, servicio de Siigo y precio/matrícula **de referencia**.
`dias_semana`/`hora_inicio`/`hora_fin`/`cancha`/`profesor_id`/`nivel` **siguen en la tabla pero SIN
USO** (bajan al horario de cada inscrito, que aún no existe) — no borrarlas todavía.
**Horarios por inscrito** (migraciones 0054–0056): `inscripciones.nivel` (nivel del NIÑO, lista cerrada
`NIVELES` en validations/academia.ts: Bola Roja/Naranja/Verde/Amarilla + Principiantes/Iniciados/
Intermedio) + tabla **`inscripcion_horarios`** (inscripcion_id, dia_semana, hora_inicio, hora_fin,
profesor_id, cancha). Una fila = una venida a la semana, con SU profesor y SU cancha: así se
representa "mar+jue 16:30 con Jorge y sáb 12:00 con Graciano", que era imposible antes.
- **La frecuencia se cuenta, no se declara**: 3 horarios = 3×sem. `plan_frecuencia` y `dias[]` quedan
  EN DESUSO (0055 le quitó el NOT NULL a `plan_frecuencia`, que obligaba a inventar un valor).
- **Trigger `inscripcion_un_deporte`**: un niño no puede estar en recreativa Y competencia del mismo
  deporte (sí puede tenis + pádel). No se puede con índice único porque el deporte vive en la academia.
  Verificado con prueba revertida: bloquea el 2º deporte igual y el horario duplicado, deja pasar el
  otro deporte y los 3 horarios del mismo niño.
- ⚠️ 0056 corrigió las políticas RLS de 0054, que usaban subconsulta a `profiles` (choca con la regla 9)
  y un SELECT `using(true)`. Ahora usan **`private.user_role()`** y los mismos roles que `inscripciones`
  — al escribir políticas nuevas, seguir ese patrón.
- UI: `horario-fila.tsx` (una venida; campos como arreglos paralelos `h_dia`/`h_hora`/`h_dur`/
  `h_profesor`/`h_cancha` que el servidor lee con `getAll`) · `inscrito-row.tsx` (inscrito con sus
  horarios, agregar/quitar día, retirar) · `inscribir-form.tsx` (niño + nivel + N filas).
  La ficha del cliente también muestra los horarios en vez del `plan_frecuencia`.

**Grupos visibles** (migración `20260824180000`, ago-2026) — **revierte** el "no existe entidad
grupo" de julio: el club volvió con una definición que sí se puede modelar.
`academia_grupo` (academia + **nombre editable** + nivel + rango de edad) → `grupo_franja`
(día, hora, profesor, cancha, cupo) → `inscripcion_franja` (a qué franjas va cada niño).
Niveles nuevos: enum **`academia_nivel`** = iniciacion|intermedio|avanzado.
- ⚠️ **Los rangos de edad los pone el club por grupo y PUEDEN SOLAPARSE.** No hay bandas
  globales, y no es pereza: medido sobre los 107 niños reales, cualquier banda parte entre 16 y
  33 de las 60 franjas que el club ya dicta (Jorge tiene mar 15:30 con niños de 9, 9 y 10).
- ⚠️ **El cupo (Iniciación 6 · Intermedio 5 · Avanzado 4) NO bloquea, avisa** (decisión de Laura).
  `grupo_franja.cupo` null = el del nivel; se llena solo para excepciones. `cupo_nivel(nivel)`.
- Sí bloquean por trigger: iniciación en academia de **competencia**, nombre de grupo repetido
  en la misma academia, rango de edad al revés y franja duplicada.
- **Cargado el 24-ago-2026**: 9 grupos (Disney en recreativa, tenistas en competencia), 64
  franjas, 100 niños, vía `scripts/import-grupos-academias.py` (simulacro por defecto,
  `--apply` para escribir, idempotente). **No se pisa con `import-ninos-academias.py`**, que
  carga las PERSONAS desde el archivo ancho; este solo arma la matrícula encima y salta al
  niño que no exista en vez de inventarlo.
- ⚠️ El importador cruza al niño **por los dígitos del documento** (el Excel pega el tipo:
  "CE1209531"; la plataforma guarda tipo y número aparte) y, si falla, **por nombre solo si es
  inequívoco** (hay niños sin documento que viven en la ficha de un padre). Los cruzados por
  nombre se reportan aparte. Los profesores casan exacto y luego por prefijo, también solo si
  es inequívoco: el staff se renombró a nombres completos ("Jorge Pérez") y el Excel trae los
  cortos ("Jorge") — sin eso, 73 filas daban falso "profesor no encontrado".
- 📌 **Pendientes con el club** (nombres en `docs/academias-tenis-datos-a-revisar.md`): 3
  documentos compartidos por 2 niños distintos (6 niños sin cargar), Sara Salazar que no
  existe, 3 niños que ningún grupo cubre, y 2 tipos de documento extranjero.
- ✅ **Interfaz de grupos completa** (ago-2026): `/academias/[id]/grupos/nuevo` y `.../editar`
  (nombre + nivel + rango de edad, con sugerencias Disney/tenistas que se pueden ignorar) y
  `.../franjas` (agregar/editar/borrar franjas del grupo). En la ficha del grupo cada niño tiene
  **Días** (reabre el formulario de inscripción en modo edición, `?miembro=`, que es idempotente) y
  **Retirar**.
  ⚠️ **Borrar un GRUPO se rechaza si tiene niños** (habría que moverlos primero), pero borrar una
  FRANJA sí se deja: el niño no pierde la inscripción, solo ese día — y aparece en el bloque ámbar
  de "sin franja asignada". Son dos cosas distintas a propósito.
- 🎾 **La clase de academia nace del bloqueo con academia → GRUPO → profesor** (migración 0073,
  `clases.grupo_id`). El modal de `/clases` propone las **franjas del grupo que caen dentro del
  bloqueo** (mismo día de la semana + hora dentro del rango) y crea **una clase por franja**, con su
  hora real: un bloqueo de 15:00–18:00 sobre un grupo con franjas de 15:30 y 16:30 son dos clases,
  sin teclear horarios. Si el grupo no tiene franja a esa hora (clase extra, reposición) se cae al
  corte manual del bloque, avisándolo.
  · El **profesor de cada franja** se usa por defecto y el select del modal es un **override que
    aplica a todas** (sirve para el suplente de hoy). Solo se pre-llena si TODAS las franjas del
    bloque coinciden en profesor: con dos profes distintos, sugerir uno sería mentira para la otra
    clase.
- 🔒 **`inscripciones.grupo_id` es NOT NULL** desde la limpieza (0074): del grupo salen el horario,
  el cupo y a quién se espera al cerrar. Una inscripción sin grupo no alimentaba nada y desaparecía
  de todas las pantallas sin dejar rastro.
- 🗑️ **Limpieza aplicada** (migración 0074, medida antes de borrar: todo en cero). Se fueron la
  tabla `inscripcion_horarios`, los 4 RPCs del tablero viejo (`academia_rendimiento_franja`,
  `academia_rendimiento_nino`, `academia_clases_periodo`, `academia_asistencia_clase`), las columnas
  `inscripciones.dias/plan_frecuencia/nivel` y diez columnas muertas de `academias`
  (`nivel, profesor_id, cancha, horario, dias_semana, hora_inicio, hora_fin, valor_alumno,
  periodo_inicio, periodo_fin`). En el código: `esperadoAcademiasCliente`/`esperadoAcademia`/
  `mesesCorridos` de finanzas.ts, `inscribirEnAcademia` de clientes/actions.ts, los `NIVELES` de bola
  y **`scripts/seed-demo.mjs`** (borraba TODOS los datos de dominio con `delete().gte("id",0)` y ya
  escribía a columnas inexistentes: con 100 niños reales cargados era una bomba, no un seeder).
- ✅ **Retirar a un niño y cambiarle los días**: en la ficha del grupo, cada inscrito tiene
  **Días** (reabre el formulario de inscripción con `?miembro=`, que es idempotente) y **Retirar**.
- **Falta**: **academias de pádel**, que Laura dejó explícitamente para después, y el cruce
  asistencia vs facturas de Siigo (bloqueado por conciliación, ver más abajo).

**Rendimiento por franja: APARCADO** (25-ago-2026). Existe el RPC
`academia_ocupacion_franja(p_academia, p_desde, p_hasta)` (migración 0075) y está verificado, pero
**ninguna pantalla lo llama**. Se probaron dos sitios y los dos se quitaron: la tabla en la ficha de
la academia (48 filas casi todas en cero, ilegible) y los avisos en el acordeón del grupo.
- 🎯 **La regla que zanjó el asunto: un aviso donde no está la acción es solo carga.** Desde la ficha
  del grupo no se puede cerrar una clase ni registrar un bloqueo. De las tres señales, dos no
  deciden nada ahí — *falta cerrar* se arregla en **`/cierre`** (que ya lista las pendientes y marca
  las de +24 h con badge rojo) y *no se dictó* en **`/clases`**. La tercera —*el grupo se está
  vaciando*— sí sería gestión de academias, pero necesita historia de asistencia que aún no existe.
  O sea que la pantalla mostraba **solo las dos que no le tocaban**.
- ✅ **Lo que SÍ se quedó: la asistencia POR NIÑO dentro de la franja.** Ahí decide algo —¿le cambio
  el día?, ¿lo retiro?— y está al lado de esos botones. Por eso el `PeriodoToggle` del grupo sigue
  vivo: alimenta ese dato, no un tablero.
- La ficha del grupo y la de la academia quedan de **matrícula**: quién está inscrito, en qué franja,
  dónde hay cupo. Marcadores de la academia = Grupos · Niños · Cupos libres · Franjas sobre cupo.
- 📅 **Cuándo retomarlo — las DOS condiciones, no una**: que haya 6 semanas de clases registradas Y
  que **el coordinador pregunte** por la tendencia de una franja. Si la pregunta sale de él, la
  pantalla se gana su sitio; si sale de nosotros, es una pantalla que nadie abre. El diseño ya está
  hecho: tres bocetos y el porqué largo en **`design/README.md`** (la buena es la Opción C).
- ⚠️ **El cuello de botella no era la pantalla: en agosto se registraron 2 clases de academia de las
  ~250 que tocaban.** Cualquier tablero montado hoy muestra rayas. Lo que rinde es quitarle fricción
  a registrar el bloqueo como clase (registro en lote desde el calendario), no pulir el informe.
- Detalles del RPC que hay que conservar si se retoma (todos costaron medirlos): la clase se pega a
  la franja **más cercana** de su día con tolerancia de **±20 min**; `desde_efectivo` = la primera
  clase que registró ESA academia, y desde ahí se cuenta lo que "tocaba" (sin eso reprochaba 16+48
  franjas por clases anteriores a que el club empezara a usar el flujo); **HOY no se reprocha**;
  `clases_por_venir` separa la programada-a-futuro de la vencida; y en "Otras horas" el conteo va con
  `count(distinct clase_id)`, porque ahí se une con `asistencias` y una clase aparece una vez POR
  ASISTENTE. `ocurrenciasDeDia()` estaba verificada por fuerza bruta (6.090/6.090) y se borró con el
  resto del helper — queda en el historial de git.
- ⚠️ Agregar una columna de salida a un RPC obliga a **DROP + CREATE**: `create or replace` lo
  rechaza con "cannot change return type of existing function".

- **Dónde va el filtro** (decisión de UX): el **periodo** va DENTRO de cada academia, con el mismo
  `PeriodoToggle` del dashboard/ingresos. NO se hizo un reporte general con selector de academia
  porque (a) la academia ya es el filtro —se llega haciéndole clic, y son 4— y (b) mezclar las 4 en
  una tabla invita a comparar cifras no comparables: un grupo de competencia con 3 niños al 94% está
  sano, uno de recreativa con 3 se muere. La lista general solo lleva el **titular** por academia
  (inscritos + "N franjas en riesgo") para saber a cuál entrar.

**Cierre — dos puertas** (`cierre/actions.ts`, validadas en el SERVIDOR, no solo en la pantalla):
- **Piso**: no se puede cerrar una clase ANTES de que empiece (`fecha + hora_inicio`; las clases sin
  hora quedan disponibles todo su día). Sin esto se marcaba asistencia por la mañana de una clase de
  la tarde — asistencia inventada que además cuenta para la liquidación. La cola de `/cierre` también
  las esconde y la pantalla de detalle muestra un aviso en vez del formulario.
- **Techo**: pasadas **24 h** desde el inicio, solo el **superadministrador** puede registrar
  (`/cierre/vencidas` las lista). Ya existía y está verificado que funciona.

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

**Falta**: importador del Excel y cruce asistencia vs facturas de Siigo.
✅ **Modal de `/clases`**: la academia y el profesor se escogen SIEMPRE a mano — adivinarlos sube el
margen de error (decisión de Laura). Ya se quitó la lógica muerta de "candidatas"
(`academiasEnBloque`, `CandidataAcademia`, `numeroCancha` en clases/types.ts + la rama del checklist):
nunca casaba, porque las 4 academias no tienen horario. `franjasDeBloque` SÍ se sigue usando, para
partir un bloque largo en varias clases.
✅ **Reporte por niño** (migración 0059, RPC `academia_rendimiento_nino`): por inscrito, cuántas clases
de SUS franjas se dictaron y a cuántas asistió. ⚠️ "Esperadas" son las clases **realmente dictadas**
(estado `realizada`) en sus franjas, NO las semanas del calendario: no se le reprocha a un niño faltar
a una clase que nunca se dio — eso sale en el tablero por franja. El % **descuenta las excusas
médicas**, que no se cobran ni son desenganche.
⚠️ El cruce con Siigo está **bloqueado por conciliación, no por código**: de 224 líneas de Academia
Recreativa Tenis solo **36 tienen `cliente_id`** (95 son mostrador). Sin saber de quién es la factura
no se puede decir "a Pepito no le cobraron". Y falta decidir cómo tratar a los hermanos: la factura va
a la familia (`cliente`) y el alumno es un `miembro`, así que dos hermanos en la misma academia
comparten una sola factura.

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
- ✅ **`precio`/`matricula` YA NO son cálculo** (la plata sale de Siigo). `LineaLiq.valorFacturado` pasó
  a `number | null` y en academia va **null** → la liquidación muestra "—", no "$ 0" (que se leería
  como "no se le cobró"). Antes estimaba `precio ÷ (días×4) × alumnos`, un número inventado al lado de
  la plata real. Impacto verificado: $0 — las 3 reglas de academia son `fijo_por_clase` y no miran el
  facturado, y no hay ninguna clase de academia `realizada`. Efecto secundario BUENO: a quien le falte
  regla de academia ahora le sale $0 (visible) en vez de un % sobre una cifra ficticia (invisible).
  Control correcto = cruzar **quién asistió** vs **a quién le facturó Siigo**, por personas, no por precio.
- **El club deja de hacer bloqueos largos**: una reserva de EasyCancha = una clase (instrucción de
  Laura al club, jul-2026). El usuario BLOQUEOS ACADEMIAS es EXCLUSIVO de academias.
- **Formato del comentario**: "Academia Recreativa Esteban". ⚠️ Pero **no se depende de él**: en el
  modal la academia se escoge SIEMPRE a mano (arranca vacía, sin pre-seleccionar) porque define a
  quién se le cobra; el **profesor** sí viene sugerido del comentario y se **confirma al cerrar la
  clase** (obligatorio: hoy una clase sin `profesor_id` desaparece de la liquidación en silencio).
- ✅ **Cierre** (hecho): la lista trae SOLO a los del GRUPO DE LA CLASE apuntados a esa franja
  (`clases.grupo_id` → `grupo_franja` → `inscripcion_franja`, día + hora ±20 min, misma tolerancia
  que el tablero). Medido con datos reales: de 100 inscritos de la academia y 28 del grupo, la lista
  del lunes 17:30 trae **5**. ⚠️ Antes filtraba por `inscripciones.dias`,
  que quedó en desuso y hoy está siempre vacío, así que la condición `dias.length === 0` dejaba pasar
  a TODOS los inscritos de la academia — Laura lo detectó viendo a una niña de lunes/miércoles en una
  clase de jueves. Los demás inscritos van en una sección **plegada** ("¿vino alguien más?") con
  default **"No vino"**, solo para registrar una reposición; en la acción, `"no"` no inserta y borra
  el registro previo si lo hubiera (ojo: `estadoAsis` cae a "presente" ante un valor desconocido, por
  eso hay un `noVino()` aparte que también excluye del correo de notificación). Y antes de guardar sale
  el conteo en vivo: "vas a registrar N presentes de M que se esperaban".
- ✅ **YA SE QUITÓ** de `/academias` la programación: `generarProgramacion`, `reprogramarClase`,
  `cancelarClase` + los componentes `programar-form.tsx` y `clase-academia-row.tsx`. La ficha no dice
  nada sobre clases (se probó una tarjeta explicativa y Laura la mandó quitar: la ficha es de
  inscritos). **El botón "+ Nueva academia" se dejó a propósito** (Laura necesita crear academias de
  prueba); se quita cuando existan las 4 fijas.
- Las 11 academias actuales NO se migran (tenían 1 sola inscripción): se archivan y se arranca desde
  un Excel que llena el club (una fila por niño y por día).

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
- 💡 **Los profesores SÍ van a entrar** (decisión de Laura, jul-2026): son quienes cierran clases.
  Hasta ahora ninguno había iniciado sesión nunca y los 9 tienen correo placeholder
  (`vena.digital.2207+profe.…`), que es de Laura, no de ellos. Laura tiene los correos reales y los
  carga por `/empleados/[id]/editar`; la ficha avisa cuando alguien no tiene correo propio, porque el
  correo es lo que se escribe para entrar.

## ⏱️ Turnos del personal (en construcción · bloque 1 hecho el 26-ago-2026)
Registro de entrada y salida por horas para quien se paga así: **Camila Arboleda** (cafetería, figura
como recepción), **Juan Fernando Gaviria** (coord. admin), **Santiago Montoya** (recepción) y
**Carlos** (vigilante, cuenta pendiente de crear). **Los profesores NO marcan** (decisión de Laura).

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
  las semanas y está bien que lo haga.** Falta confirmar si entra por empresa de vigilancia (entonces
  los recargos no los debe el club) o como empleado directo.

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
- 📅 **Semana del 10-ago-2026 — revisar la ventana de candidatas con el torneo del 7-8 de agosto ya
  corrido.** Se aplazó a propósito para medir el comportamiento real en vez de construir a ciegas.
  Dos preguntas: (a) ¿la ventana −5/+10 capturó todas las facturas del torneo?, (b) ¿hace falta el
  buscador por número de factura para atar las que caigan fuera? El club dice que los pagos entran el
  día del torneo, así que lo esperable es que sí alcance.
- Rotar tokens expuestos en chat: PAT de Supabase y access_key de Siigo (Laura debe regenerarlos).
- **Apuntar el SMTP de Supabase a Resend** → habilita enlace de "olvidé mi contraseña" y confirmación
  al cambiar de correo. Hoy ambos flujos van por el SA.
- **Cargar los correos reales de los 9 profesores** y darles su contraseña (ver Perfil y acceso).
- D3 · catálogo estándar de paquetes (Laura levanta info con el centro).
- Retirar `profesor_valor_clase` / `profesor_compensacion` cuando se confirme que nadie vuelve al
  modelo viejo de pagos a profesores (hoy TODOS los entrenadores están migrados a reglas).
