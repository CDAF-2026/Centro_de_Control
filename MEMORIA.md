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
| Sync clientes EasyCancha | `npm run sync:clientes` |
| Redeploy Edge Function siigo-sync | `node --env-file=.env scripts/deploy-siigo-fn.mjs`; re-agendar cron: `scripts/schedule-siigo-cron.mjs` |
| Verificar esquema/datos | script one-off con Management API (`POST /v1/projects/$REF/database/query`, token de .env) o service-role |

## Reglas duras
1. **Migraciones**: escribir SQL en `supabase/migrations/` + actualizar `src/lib/database.types.ts` A MANO
   (es manual, no generado) + `npm run db:apply` + verificar por API. Nunca asumir aplicada sin verificar.
2. **PostgREST corta a 1000 filas**: NUNCA traer facturas/filas masivas y agregarlas en JS. Toda
   suma/agrupación va en **RPCs SQL** (ya existen: `siigo_recaudo`, `siigo_ingreso_diario`,
   `siigo_top_clientes`, `siigo_ingreso_servicio`, `siigo_cartera`, `siigo_resumen_cliente`).
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

## Datos (dominios → tablas)
- **Clientes/CRM**: `clientes` (deportes[], documento=cédula, importados de EasyCancha), `acudientes`,
  `cliente_documentos` (Storage). Ficha: situación financiera = `siigo_resumen_cliente(id)`.
- **Operación**: `academias`, `inscripciones` (dias[]), `clases` (tipo academia|individual,
  valor_facturado), `asistencias` (estado: presente/ausente/excusa_medica/reposicion),
  `paquetes_catalogo`, `paquetes_cliente` (inicia_el/vence_el), `eventos` + `evento_participantes`
  + `evento_profesores` (eventos NO crean pagos; su ingreso = facturas Siigo con evento_id).
- **Dinero (Siigo)**: `siigo_facturas` (siigo_id único, total, saldo=deuda, cliente_id, evento_id,
  estado_conciliacion: auto|pendiente|mostrador|conciliada), `siigo_factura_lineas` (servicio_id, monto),
  `siigo_productos` (caché código→grupo→servicio), `siigo_sync` (cursor). Catálogo `servicios`
  (clave, color, categoria_saldo, siigo_grupo ↔ account_group de Siigo).
- **Nómina**: `profesor_compensacion` (por_clase | fijo_comision | fisico + valor_alumno_academia);
  liquidación calculada en `src/lib/liquidacion.ts` (clases realizadas + eventos, etiquetados).
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
(20/pág, filtro por servicio; ingresos también por periodo) · `/pagos` cola de conciliación (asignar
cliente/evento por NIT; "mostrador" no aparece) · `/clientes` (paginado 30, autocomplete) · `/academias`
· `/paquetes` · `/eventos` · `/clases` (calendario; academia = morado #8b7cf6) · `/cierre` (solo fecha ≤
hoy; academia: asistencia por estado) · `/liquidacion` (facturado vs a pagar; periodo mes/q1/q2) ·
`/empleados` (compensación) · `/config` (catálogo de servicios) · `/reportes` · `/agente` (aún lee
modelo viejo — pendiente repuntar a Siigo).

## Contexto de negocio (decisiones de Laura)
- Conciliación manual = solo deudas + facturas con cliente identificado; el mostrador anónimo queda
  cerrado como ingreso (pero siempre conciliable a mano). Conciliar una factura ata TODAS las del mismo
  NIT y guarda la cédula (auto-match futuro).
- Facturas "canasta mixta": se desglosan por línea; categoría = grupo del producto (18 grupos Siigo ↔
  catálogo `servicios`, match con trim/lowercase — ojo espacios finales en Siigo).
- Academia: cobro por sesión asistida (excusa médica no se cobra) + matrícula UNA por deporte, SEMESTRAL.
- Historia de datos arranca el **1-jun-2026**: comparativas "Mes vs anterior" serán completas desde agosto.

## Pendientes conocidos
- Rotar tokens expuestos en chat: PAT de Supabase y access_key de Siigo (Laura debe regenerarlos).
- D3 · catálogo estándar de paquetes (Laura levanta info con el centro).
- Agente IA → leer ingresos de Siigo (aún consulta `pagos` viejo).
- Retirar tablas en desuso cuando se confirme estabilidad.
