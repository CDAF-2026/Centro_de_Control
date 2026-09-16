# HANDOFF — Centro de Control CDAF

> **Documento de traspaso.** Si eres una IA (o una persona) que va a trabajar sobre este
> proyecto por primera vez: **lee este archivo completo antes de tocar una sola línea de
> código.** Está escrito para que puedas ser útil sin romper nada.
>
> Última actualización: **16 de septiembre de 2026**.

---

## 0 · Lo primero que tienes que entender

**Esto NO es un proyecto de práctica. Está en producción, con datos reales, y mueve
dinero real.**

- **Producción:** https://alejandrofallacd.com — el club la usa todos los días.
- Hay **~496 clientes reales**, **~5.350 facturas de Siigo**, **100 niños matriculados en
  academias**, un equipo de staff con cuentas propias y un módulo de **nómina por horas**
  que decide cuánto se le paga a la gente.
- Un error tuyo puede: cobrarle mal a una familia, pagarle de menos a un entrenador,
  borrar la asistencia que sustenta una liquidación, o dejar a un empleado sin poder
  entrar a trabajar.

**Por eso la regla número uno de este repositorio es: verificar antes de afirmar.**
Nunca digas "ya quedó" sin haberlo medido. Nunca supongas que una migración se aplicó,
que una consulta devolvió filas, o que una escritura se guardó.

### Los tres documentos del proyecto

| Archivo | Qué es | Cuándo leerlo |
|---|---|---|
| **`handoff.md`** (este) | El contrato: arquitectura, reglas duras, zonas de peligro, patrones obligatorios. | **Siempre, primero.** |
| **`MEMORIA.md`** | La memoria larga: el historial de CADA decisión de producto y CADA bug con su causa raíz medida. ~1.500 líneas. | Antes de tocar un módulo concreto — busca ese módulo ahí. |
| **`AGENTS.md`** | Recordatorio de que Next.js 16 tiene *breaking changes* respecto a lo que sabes. | Antes de escribir código de Next. |
| `.interface-design/system.md` | Sistema de diseño (tokens, patrones de UI). | Antes de tocar cualquier pantalla. |
| `DESPLIEGUE.md` | Variables de entorno de Vercel y pasos del despliegue. | Antes de tocar configuración de despliegue. |

`CLAUDE.md` simplemente importa `AGENTS.md` y `MEMORIA.md`.

### Con quién trabajas

**Laura Salazar (Vena Digital)** es la persona a cargo. Reglas de trato:

- **Se trabaja en español**, siempre. Código y comentarios también en español.
- **Trabaja de forma iterativa**: revisa en local y pide ajustes de a uno. No te adelantes
  a construir cinco cosas cuando pidió una.
- **Explícale lo técnico en lenguaje simple, con ejemplos.** No es ingeniera de software;
  es quien conoce el negocio.
- **Pregunta antes de decidir temas de producto.** Si la respuesta cambia lo que se
  construye, pregunta. Si es una decisión técnica rutinaria, decídela tú y avísale.
- **Verifica las cifras contra datos reales antes de afirmarlas.** Si dices "hay 320
  clientes", tienes que haberlo consultado.

---

## 1 · 🚨 Zona de peligro — lo que NUNCA debes hacer

Esta lista existe porque **cada punto ya causó un daño real**. No son hipótesis.

### Base de datos

1. **NUNCA borres datos sin medir primero.** Antes de cualquier `delete`/`drop`, cuenta
   las filas y verifica todas las referencias (FKs, columnas que apuntan ahí). El proyecto
   tiene respaldo **diario** (Supabase Pro), **no PITR** — si borras algo hoy, se puede
   perder hasta un día de trabajo.
2. **NUNCA reutilices un prefijo de versión de migración.** `db-apply` compara el prefijo
   del nombre contra `supabase_migrations.schema_migrations`: si repites una versión ya
   usada, **el archivo se da por aplicado y NO SE EJECUTA, en silencio**, y el script
   dice "✅ No hay migraciones pendientes". Pasó el 24-ago-2026 y las tablas nunca se
   crearon. **Siempre:** `ls supabase/migrations/ | tail -3` antes de nombrar una.
3. **NUNCA asumas que una migración se aplicó.** Verifícalo por API contra el objeto real
   (`to_regclass`, `pg_policies`, `information_schema`). El "ok" del script no basta.
4. **NUNCA hagas `create or replace` de un RPC si cambias su salida** — Postgres lo
   rechaza ("cannot change return type"). Hay que hacer **DROP + CREATE**. Y si agregas un
   parámetro, también DROP + CREATE: dejar dos firmas vuelve ambigua la llamada.
5. **NUNCA uses `npm run db:push`** desde un agente: el Postgres directo del proyecto es
   IPv6-only. Usa **`npm run db:apply`** (Management API por HTTPS).
6. **NUNCA verifiques RLS dentro de un bloque `DO`.** plpgsql cachea el plan y evalúa la
   política con un rol viejo — da falsos "BLOQUEADO" y falsos "permitido". Verifica con
   **sentencias directas**, cada una en su transacción, con `set local role authenticated`
   + `request.jwt.claims`, y revierte.
7. **`alter policy … using (…)` NO toca el `with check`.** Una política de UPDATE tiene dos
   mitades y `alter policy` reemplaza solo la que nombras. Al agregar un rol hay que tocar
   las DOS, o el rol abre el formulario y el guardado rebota con *"new row violates row-level
   security policy"* — **y la migración se aplica sin error**. Al auditar, mira las dos
   columnas de `pg_policies` (`qual` Y `with_check`).

### Dinero y nómina

8. **NUNCA traigas filas masivas para sumarlas en JS.** PostgREST **corta a 1.000 filas sin
   avisar**: el total se desinfla en silencio. Toda suma/agrupación va en un **RPC SQL**.
9. **Siigo manda para el dinero.** Ingresos, pagos y deuda salen de `siigo_facturas`
   (deuda = `saldo`). No inventes cálculos internos de saldos; el modelo viejo está muerto
   y sus tablas (`pagos`, `asignaciones_pago`, `abonos`) **ya se borraron**.
10. **NUNCA cambies `vence_el` de un paquete sin recalcular su `estado`**, o queda vivo en
    la fecha y muerto en el estado.
11. **El saldo de un paquete se mueve al CERRAR la clase, nunca al registrarla.** Tocar el
    saldo a mano con la clase aún `programada` produce **doble descuento** cuando se cierre.

### Permisos

12. **El guardia de la página NO protege la Server Action.** Cada `page.tsx` con
    `requireRole` necesita que su `actions.ts` valide el rol **otra vez**. Pasó con
    `/dashboard` y con `cerrarClase`: cualquiera con sesión podía cerrar una clase.
13. **Cambiar `PERMISSIONS` NO cambia las políticas de la base.** Son dos capas
    independientes. Si abres un módulo en la matriz y no tocas RLS, el usuario ve los
    botones y **todo guardado le falla**.
14. **NUNCA le des `update` directo sobre una tabla a un rol para resolver un permiso.**
    Una política de UPDATE **no puede limitar por columna**: darle escritura a
    `siigo_facturas` para que ate un evento sería darle la tabla del dinero entera. Eso va
    por **RPC `SECURITY DEFINER`** que valida por dentro y toca una sola columna.

### Archivos y secretos

15. **Los secretos viven SOLO en `.env`** (gitignored): `service_role`, OpenAI, Resend,
    EasyCancha, Siigo, PAT de Supabase, `SYNC_SECRET`. **Nunca al repo. Nunca con prefijo
    `NEXT_PUBLIC_`.** Server-side únicamente.
16. **Al subir el tope de un archivo hay que tocar DOS sitios**: la validación de la server
    action **y** `experimental.serverActions.bodySizeLimit` en `next.config.ts` (hoy en
    **12 MB**). Next corta en 1 MB por defecto y el archivo se rechaza **antes** de llegar
    a tu validación.

### Proceso

17. **NUNCA hagas commit sin `npm run build` Y `npm test` en verde.** Los dos. No uno.
18. **NUNCA corras `npm run build` y `npm test` a la vez**: las pruebas contra Postgres
    tienen 20 s de tope y el build compitiendo por CPU las tumba.
19. **NUNCA desactives una prueba para que pase el commit.** Si una prueba falla, o
    encontró un bug real o la prueba depende de un estado que el club movió — averigua cuál.

---

## 2 · Qué es el proyecto

Plataforma interna de **gestión + CRM** del **Centro Deportivo Alejandro Falla** (CDAF),
un club de **tenis y pádel** en Colombia.

Cubre, en un solo sitio, lo que el club hacía en Excel y WhatsApp:

- **CRM de clientes** (fichas familiares con hermanos, acudientes, documentos).
- **Academias** de tenis/pádel: grupos, franjas horarias, niños matriculados, asistencia.
- **Clases** particulares y de paquete, sobre el calendario real de canchas.
- **Eventos/torneos** con P&G propio (ingresos atados + gastos).
- **Dinero**: ingresos, cartera por cobrar, conciliación de facturas — todo desde Siigo.
- **Nómina**: liquidación de entrenadores por reglas, y turnos por horas del personal
  administrativo (con la normativa laboral colombiana codificada en SQL).
- **Notas**: tablón de relevo de turno del staff.

### Integraciones externas

| Sistema | Qué aporta | Dirección |
|---|---|---|
| **Siigo** (ERP) | **La verdad del dinero.** Facturas, saldos, productos. NIT de Siigo = cédula del cliente. | Solo lectura (entra a la plataforma) |
| **EasyCancha** | Reservas de cancha. De ahí sale el calendario, quién reservó y qué profesor. | Solo lectura |
| **Resend** | Correos con marca (confirmación de clase cerrada). | Salida |
| **OpenAI** | El módulo `/agente` (consultas en lenguaje natural). | Salida |

---

## 3 · Stack y arquitectura

```
Next.js 16.2.7 (App Router + Turbopack)
React 19.2.4 · TypeScript 5
Tailwind CSS v4 · shadcn estilo "base-nova" sobre Base UI (NO Radix)
Supabase — Postgres + RLS + Auth + Storage (proyecto rxkfgbxdxhrirsscvfwe)
Zod 4 (validación) · Vitest 4 (pruebas) · Playwright (e2e)
Despliegue: Vercel (plan Pro)
```

### ⚠️ Next.js 16 no es el Next.js que conoces

Tiene *breaking changes* respecto a tu entrenamiento. **Antes de escribir código de Next,
lee la guía correspondiente en `node_modules/next/dist/docs/`.** Haz caso a los avisos de
deprecación. Ejemplo real del proyecto: tras una mutación se usa **`refresh()` de
`next/cache`**, no `revalidatePath`.

### ⚠️ shadcn aquí corre sobre Base UI, no sobre Radix

`components.json` declara `"style": "base-nova"`. Las importaciones son de `@base-ui/react`.
Consecuencia práctica en pruebas: `DialogTitle`/`DialogDescription` de Base UI **exigen el
contexto del diálogo** y revientan con `renderToStaticMarkup` — por eso el contenido de un
modal no se puede probar con render estático (ver §9).

### Arquitectura en una frase

**Server Components por defecto + Server Actions para escribir + RLS de Postgres como
último candado.** No hay API REST propia ni capa de servicios: la página consulta Supabase
directamente con la sesión del usuario, y la RLS decide qué ve.

### Las tres capas de seguridad (y por qué hay tres)

```
1. MENÚ        → PERMISSIONS (src/lib/auth/permissions.ts)   ... solo PINTA
2. GUARDIA     → requireRole() en page.tsx Y en actions.ts   ... redirige
3. RLS         → políticas de Postgres + RPC SECURITY DEFINER ... el candado real
```

Ninguna sustituye a la otra. Quitar algo del menú **lo esconde, no lo cierra**. El proyecto
aprendió esto tres veces (dashboard, `cerrarClase`, `/config`).

---

## 4 · Estructura del repositorio

```
src/
  app/
    (app)/                 # Todo lo que exige sesión. layout.tsx llama requireProfile()
      dashboard/  clientes/  empleados/  academias/  paquetes/  clases/
      eventos/  notas/  turnos/  horas/  cierre/  pagos/  cartera/
      ingresos/  liquidacion/  agente/  config/  perfil/
    (auth)/login/
    quiosco/               # FUERA de (app): aparato de una sola función, sin menú
    styleguide/
    globals.css            # Tokens de marca + semánticos shadcn
  components/
    app-shell/             # Sidebar + header + campanita de notas
    ui/                    # badge, button, card, dialog, empty-state, input, label
  lib/
    auth/                  # permissions.ts, index.ts (requireRole), mensajes.ts, actions.ts
    supabase/              # client.ts (browser), server.ts (RSC), admin.ts (service_role), middleware.ts
    validations/           # esquemas zod por dominio
    easycancha/            # cliente de la API + claveProfesor() + pareceClase()
    email/  openai/
    database.types.ts      # ⚠️ MANUAL, no generado
    liquidacion.ts  turnos.ts  eventos.ts  finanzas.ts  periodo.ts
    staff.ts  deportistas.ts  clientes-match.ts  fecha.ts  audit.ts
supabase/
  migrations/              # 99 archivos. Fuente de verdad del esquema
  functions/               # Edge Functions (Deno): siigo-sync, turnos-limpiar-fotos
scripts/                   # Utilidades de consola (.mjs y .py)
tests/                     # 16 archivos de Vitest — muchos contra Postgres real
e2e/                       # Playwright
docs/                      # Pendientes con el club (datos a revisar)
```

### Convención de archivos por módulo

Cada carpeta de `(app)/` sigue el mismo patrón:

```
page.tsx          # Server Component. Hace requireRole() y consulta.
actions.ts        # "use server". CADA acción revalida el rol.
<algo>-form.tsx   # Client Component ("use client") con el formulario.
types.ts          # Tipos del módulo (solo donde hace falta).
```

---

## 5 · Comandos

| Qué | Comando |
|---|---|
| Servidor de desarrollo | `nohup npm run dev > /tmp/cdaf-dev.log 2>&1 & disown` → localhost:3000 |
| **Build (obligatorio antes de commit)** | `npm run build` (si falla por Google Fonts, reintenta) |
| **Pruebas (obligatorio antes de commit)** | `npm test` |
| Aplicar migraciones | `npm run db:apply` (`--dry-run` para listar) |
| Sync de facturas Siigo | `npm run sync:siigo` (`--full` reimporta desde 2026-06-01) |
| Solo catálogo de productos Siigo | `npm run sync:productos` (`-- --dry` simulacro) |
| Sync de clientes EasyCancha | `npm run sync:clientes` |
| Backfill de documentos EasyCancha | `npm run sync:documentos` (`-- --apply` para escribir) |
| Backfill de cédulas por nombre | `npm run match:siigo -- --apply` |
| Redeploy Edge Function de Siigo | `node --env-file=.env scripts/deploy-siigo-fn.mjs` |
| Redeploy tarea de fotos de turno | `npm run deploy:turnos-fn` · cron: `npm run cron:turnos` |
| E2E | `npm run test:e2e` |

**Nunca corras build y test a la vez** (ver §1.18).

### Turbopack "stale"

Si el dev tira `require is not defined` en un chunk de `node_modules_*.js` con badge
**(stale)**, es caché corrupta de Turbopack, **no tu código**. Verifícalo
(`grep -rn "require(" src/` vacío + `npm run build` pasa) y luego:

```bash
pkill -f "next dev" && rm -rf .next && nohup npm run dev > /tmp/cdaf-dev.log 2>&1 & disown
```

---

## 6 · Modelo de datos

La fuente de verdad del esquema son las **migraciones**. `src/lib/database.types.ts` es
**manual** — si cambias el esquema, actualízalo a mano.

### Dominios → tablas

**Clientes / CRM**
- `clientes` — la **ficha familiar** (no una persona). `documento` = cédula,
  `tipo_documento` (CC/TI/CE/PP/NIT), `fecha_nacimiento`, `deportes[]`.
- `cliente_miembros` — **las personas**. Hermanos, hijos, el titular.
- `acudientes`, `cliente_documentos` (bucket `cliente-docs`).

> 🔒 **Toda ficha nace con su fila de titular**, y lo hace el **trigger
> `clientes_crear_titular`** (migración 0066), NO el código. Hay **cinco sitios** que crean
> fichas y basta que uno lo olvide para que la operación (asistencia, paquetes) cuelgue de
> la nada y la clase salga como "Sin deportista". **Al crear una ficha desde código nuevo:
> no insertes el titular, ya está.**

> 👤 **El nombre del deportista NUNCA se lee de `clientes`.** El profesor no tiene el módulo
> de clientes y `clientes_select` lo excluye: esa consulta con su sesión devuelve **0 filas
> sin error**. Se lee de `cliente_miembros` — usa `src/lib/deportistas.ts`.

**Operación**
- `academias` (4 fijas: recreativa/competencia × tenis/pádel) → `academia_grupo` (nombre
  editable, nivel, rango de edad) → `grupo_franja` (día, hora, profesor, cancha, cupo) →
  `inscripcion_franja`.
- `inscripciones` (`grupo_id` **NOT NULL**), `clases` (tipo academia|individual,
  `paquete_cliente_id`, `valor_facturado`, `num_asistentes`, `grupo_id`), `asistencias`.
- `paquetes_catalogo`, `paquetes_cliente` (`inicia_el`/`vence_el`, estado
  activo|agotado|vencido|anulado).
- `eventos` + `evento_participantes` + `evento_profesores` + `evento_gastos`.

**Dinero (Siigo)**
- `siigo_facturas` (`siigo_id` único, `total`, `saldo`=deuda, `cliente_id`, `evento_id`,
  `estado_conciliacion`: auto|pendiente|mostrador|conciliada).
- `siigo_factura_lineas` (`servicio_id`, `monto`), `siigo_productos` (caché), `siigo_sync`.
- `servicios` — catálogo **local** (clave, color, `siigo_grupo`, `siigo_codigos[]`).

**Nómina**
- `profesor_regla` — modelo vigente de pago por entrenador.
- `turno`, `turno_pausa`, `turno_pin`, `festivo`.
- `profesor_compensacion` / `profesor_valor_clase` — **modelo viejo, en desuso, no borrar
  aún** (son el respaldo).

**Staff y bitácora**
- `profiles` (rol, `activo`, `marca_turno`, `avatar_path`, `deportes[]`),
  `easycancha_profesor_alias`, `audit_log`, `notas` + `nota_destinatarios` + `nota_comentarios`.

### RPCs importantes (todo agregado va aquí, nunca en JS)

`siigo_recaudo` · `siigo_ingreso_diario` · `siigo_facturado_diario` · `siigo_facturado_servicio` ·
`siigo_ingreso_servicio` · `siigo_top_clientes` · `siigo_cartera` · `siigo_cartera_antiguedad` ·
`siigo_resumen_cliente` · `eventos_pyg` · `evento_facturas_candidatas` · `evento_atar_facturas` ·
`evento_soltar_factura` · `eventos_resultado_periodo` · `eventos_retenido` · `staff_directorio` ·
`staff_docentes` · `notas_listar` · `nota_comentar` · `paquete_consumir` · `turnos_horas` ·
`turnos_listar` · `turno_marcar` · `quiosco_marcar` · `academia_ocupacion_franja`.

> ⚠️ `siigo_recaudo`, `siigo_ingreso_diario`, `siigo_facturado_diario` y
> `siigo_facturado_servicio` tienen un 3er parámetro **`p_excluir_eventos` (default false)**.
> **Solo el dashboard lo pasa en `true`**, para que un torneo aporte su utilidad neta y no
> su bruto. `/ingresos`, `/cartera` y la liquidación usan el default y ven el 100%.

---

## 7 · Seguridad y permisos

### Los roles (8)

| Rol | Quién es |
|---|---|
| `superadmin` | Laura. Ve y hace todo. |
| `coord_admin` | Coordinación administrativa. |
| `coord_deportivo` | Coordinación deportiva (lleva torneos y academias). |
| `recepcion` | Recepción / cafetería. Registra clases. |
| `profesor` | Entrenadores. Ven el calendario y cierran sus clases. |
| `gestion_eventos` | Solo torneos + clientes + notas. |
| `seguridad` | Vigilante. Solo marca turno. |
| `quiosco` | **No es una persona:** el PC de recepción con sesión abierta para marcar turnos. |

### Matriz de permisos (fuente única: `src/lib/auth/permissions.ts`)

**E** = edita · **L** = solo ve · **—** = sin acceso

| Módulo | SA | C. admin | C. deportivo | Recepción | Profesor | G. Eventos |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| dashboard (+ `/ingresos`) | E | — | — | — | — | — |
| cartera | E | L | — | — | — | — |
| clientes | E | E | L | E | — | E |
| ↳ plata del cliente | E | E | — | — | — | — |
| empleados | E | E | — | — | — | — |
| academias | E | E | E | L | — | — |
| clases (calendario) | E | E | E | E | L | — |
| paquetes | E | E | L | E | — | — |
| eventos | E | E | E | L | — | E |
| notas | E | E | E | E | E | E |
| cierre de clases | E | — | E | — | E | — |
| pagos (conciliación) | E | E | — | — | — | — |
| liquidación · agente | E | — | — | — | — | — |
| config | **L** | — | — | — | — | — |
| turnos (marcar) | E | E | E | E | E | E |
| reporte de horas | E | **L** | — | — | — | — |

`seguridad` solo tiene `turnos`. `quiosco` no tiene ningún módulo (usa `/quiosco`).

### Reglas que hay que respetar al tocar permisos

1. **Un rol nuevo va en DOS sitios obligatorios**: la matriz `PERMISSIONS` **y**
   `ALL_ROLES`. Un rol que falte en `ALL_ROLES` queda **mudo**: `rolesForModule` solo
   recorre esa lista. (Hubo una tercera lista, `STAFF_ROLES` en `validations/empleado.ts`,
   que ya deriva de `ALL_ROLES`.)
2. **Los guardias se escriben de TRES formas y hay que barrer las tres**:
   ```bash
   grep -rnE "AppRole\[\] *=" src/
   grep -rn 'requireRole(\[' src/
   grep -rnE '\["superadmin"[^]]*\]\.includes' src/
   ```
   La mayoría deben derivar de `rolesForModule(modulo, "edit"|"read")`. Solo deben quedar
   literales los **solo-SA deliberados** (crear cuentas, cambiar rol, asignar contraseña,
   cerrar clase vencida) y las reglas de DENTRO de un módulo.
3. **Reglas de dentro de un módulo van en una constante compartida**, no en la matriz:
   `PUEDE_REABRIR_EVENTO` (`src/lib/eventos.ts`), `PUEDE_CORREGIR_TURNO`
   (`src/lib/turnos.ts`), `ADMIN_NOTAS`. De ahí beben **la server action y el gateo del
   botón** — una sola lista para las dos capas.
4. **`rutaInicio(role)`** decide a dónde cae cada rol al entrar. Se usa en **tres sitios**
   (login, redirect de `/login` con sesión, fallback de `requireRole`). Dejar `/dashboard`
   fijo en cualquiera de los tres deja al usuario rebotando.
5. **Nunca leas `public.profiles` directo para listar compañeros.** `profiles_select` solo
   deja ver el propio perfil salvo a SA/CA: a recepción y profesores los selectores les
   salen **vacíos**. Usa los helpers de **`src/lib/staff.ts`**:
   - `profesoresActivos` — para elegir
   - `profesoresParaFiltrar` — filtros históricos (incluye inactivos)
   - `mapaNombresStaff` / `nombreStaff` — nombres de registros viejos
   - `staffDirectorio` — el @ de notas

   Excepción legítima: `/empleados`, `/liquidacion` y `/agente` (solo SA/CA).

### Blindajes por trigger (no por política)

- **`profiles_blindar_rol`** — nadie salvo el SA cambia `role`, `activo`, `marca_turno` ni
  `deportes` de un perfil. Va en trigger porque comparar contra el valor viejo dentro de la
  política obligaría a leer `profiles` dentro de su propia RLS (recursión).
- **`notas_solo_autor_edita`** — solo el autor cambia texto/prioridad. RLS decide por fila,
  no por columna, y **resolver también es un UPDATE**: sin el trigger, cualquiera reescribía
  cualquier nota del tablón.
- **`clientes_crear_titular`** — la invariante de la ficha, ver §6.
- **`inscripcion_un_deporte`** — un niño no puede estar en recreativa Y competencia del
  mismo deporte.

### ⚠️ En Supabase, "no dar grants" NO cierra nada

El proyecto trae `alter default privileges … grant all on tables to anon, authenticated`.
**Toda tabla nueva del esquema público nace con SELECT/INSERT/UPDATE/DELETE para `anon` y
`authenticated`.** En la práctica la RLS sin políticas de escritura ya niega, pero eso deja
una tabla sensible defendida por una sola capa.

**Al crear una tabla sensible:** `revoke all … from anon, authenticated` explícito y
devuelve solo lo que hace falta.

---

## 8 · Los fallos silenciosos — el catálogo

**Este es el corazón del documento.** Si entiendes solo una sección, que sea esta.

> 💡 **La regla que las une todas: dos situaciones que se arreglan distinto no pueden verse
> iguales.** Un fallo que no se distingue de un éxito es peor que un error ruidoso, porque
> nadie lo busca.

### A. Una LECTURA rechazada por RLS devuelve **0 filas sin error**

No lanza excepción. La pantalla se pinta perfecta, vacía. Casos reales:
- El profesor veía "—" en el nombre de TODOS sus alumnos (leía `clientes`).
- Los selectores de staff salían vacíos para recepción (leía `profiles`).

**Al escribir una consulta, pregúntate: ¿con qué sesión corre esto, y esa sesión puede leer
esta tabla?** Si no estás seguro, pruébalo simulando la sesión de ese rol.

### B. Una ESCRITURA rechazada por RLS **no escribe y sigue de largo**

Igual de callada, pero peor: se pierde un dato. Mordió el 4-sep-2026: al cerrar una clase
de paquete, el descuento del saldo era un `update` directo a `paquetes_cliente`, cuya
política solo cubre SA/CA/recepción — así que **cuando cerraba un profesor o el coordinador
deportivo (los que más cierran) el saldo no bajaba**. Una clienta mostraba 8/8 disponibles
con 2 clases dictadas.

**Regla: toda escritura sobre una tabla que el rol ejecutor no puede escribir va por RPC
`SECURITY DEFINER`, y SIEMPRE se mira el `error` de la respuesta.**

```ts
const { error } = await supabase.rpc("paquete_consumir", { p_clase, p_delta });
if (error) return { error: "No se pudo descontar del paquete." };
```

### C. `npm run build` en verde NO significa que la página abra

El 25-ago-2026 `/academias/[id]` cayó en producción con "This page couldn't load": una
función leía una `const` declarada veinte líneas más abajo →
`ReferenceError: Cannot access 'X' before initialization` en cada render.

**No lo vio nadie:** `tsc` no lo ve porque la lectura ocurre dentro de una función;
`next build` no lo ve porque las páginas son dinámicas; y `curl` solo llega al **307 hacia
/login**, así que un 500 y un redirect se ven igual desde fuera.

**Por eso existen las pruebas de render** (`tests/*-render.test.tsx`): montan las páginas
con `renderToStaticMarkup`, saltándose el guardia de sesión (`vi.mock` de `@/lib/auth`).
**Al tocar una pantalla, agrégale su render ahí.**

### D. Un renombre en un sistema externo rompe la categorización en silencio

- **Siigo**: el sync casa las líneas por el **nombre** del grupo de producto. Si el club lo
  renombra, esa plata entra con `servicio_id = null`: el total del club sigue cuadrando y
  solo se desinfla la tajada de ese servicio. Pasó el 30-jul-2026 con los cuatro grupos de
  academia. **Detector:** el aviso de grupos huérfanos en `/config`.
- **EasyCancha**: si renombran la cancha ("Profesor Willinton" → "Willington"), ningún alias
  casa y el calendario deja de atribuir esas reservas. **Detector:** listar los `courtName`
  del mes, pasarlos por `claveProfesor()` y ver cuáles no tienen alias. **Nada lo hace
  automáticamente** — repítelo cada vez que entre personal nuevo.

### E. Un profesor nuevo falla por TRES lados distintos, cada uno en silencio

Al entrar un entrenador hay que crearle **las tres cosas**:
1. **Perfil** en `profiles` (si no, no existe para la app).
2. **Alias** en `easycancha_profesor_alias` (si no, sus reservas vienen sin profesor).
3. **Reglas** en `profesor_regla` (si no, **se liquida en $0 sin un solo aviso**).

Ninguna de las tres avisa si falta. En septiembre de 2026 entraron dos profesores sin alias
(93 reservas sin atribuir) y uno sigue con 0 reglas.

### F. Una clase sin `profesor_id` desaparece de la liquidación

`liquidacion.ts` hace `if (!c.profesor_id) continue`. La clase se dictó, se cobró, y no se
le pagó a nadie. Se arregla desde el modal de `/clases` (fila "Profesor", solo aparece si
la clase no tiene profesor — **repara una omisión, no reasigna**).

### G. Al usuario también hay que distinguirle los fallos

El login decía *"Correo o contraseña incorrectos"* ante **cualquier** fallo — incluido "la
base de datos no responde". El 14-sep-2026 Supabase pausó el proyecto por facturas sin pagar
y la pantalla acusó a Laura de escribir mal su clave. **La web de Vercel respondía 200**: se
cae la base, no el sitio, y desde fuera se ven igual.

Hoy `mensajeLogin()` (`src/lib/auth/mensajes.ts`) separa cuatro casos: problema del sistema,
demasiados intentos, cuenta dada de baja, y clave mala.

### H. Una prueba no puede depender de un estado que el club mueve

Tres veces ha mordido:
- Una prueba usaba a un profesor "que nunca marca turno"… y el club lo dio de baja → 13
  pruebas cayeron con un mensaje sin relación.
- Nueve pruebas preguntaban "¿cuántos turnos tiene esta persona?", que con la tabla vacía
  equivalía a "¿cuántos acabo de crear?" → con datos reales daban 8 donde esperaban 1.
- Dos pruebas abrían un turno para la misma persona → `duplicate key` **según la hora del
  día**, y solo al correr la suite completa.

**Reglas:** toma un corte de `max(id)` al abrir la transacción y mira solo lo tuyo; fuerza
tú las precondiciones dentro de la transacción; y usa personas distintas en pruebas que
escriben de verdad.

### I. Dos copias de la misma normalización son una bomba de tiempo

El ranking del dashboard tenía su **propia** copia de `profesorDeCancha`, parecida pero no
igual → partía a un profesor en dos personas. Ya usa la función compartida. Mismo caso con
`buscarClienteDeReserva()`, que hoy usan los dos sitios que buscaban por su cuenta.

**Antes de escribir una función de normalización, busca si ya existe.**

### J. El dato correcto con la pantalla mintiendo

Laura reportó que una clase "seguía apareciendo como individual" — el dato ya estaba
correcto, pero el subtítulo decía `"Clase individual"` para todas las de `tipo=individual`,
sin distinguir paquete de particular. **Es peor que un dato malo, porque invita a "arreglar"
lo que ya está bien.**

---

## 9 · Pruebas

```bash
npm test          # Vitest, 16 archivos
npm run test:e2e  # Playwright
```

### Tipos de prueba en el proyecto

| Tipo | Archivos | Qué hace |
|---|---|---|
| **Render** | `*-render.test.tsx` | Monta páginas reales con `renderToStaticMarkup`. Caza los `ReferenceError` que el build no ve. |
| **Contra Postgres** | `rls.test.ts`, `turnos-*.test.ts`, parte de `cobro-clase` | Escriben de verdad y **revierten**. Prueban RLS y reglas de la base. |
| **Lógica pura** | `cliente-match`, `reserva-vs-clase`, `login-mensajes`, `instante-clase` | Sin base. Datos reales del club como casos. |

### Reglas al escribir pruebas

- **Al tocar una pantalla, agrégale su render** a `tests/*-render.test.tsx`.
- **Las pruebas de rechazo necesitan `SAVEPOINT`**: en Postgres un error deja la
  transacción abortada y toda sentencia siguiente responde "current transaction is aborted"
  — sin savepoint, la primera prueba de rechazo tumba en cascada a las diez siguientes con
  mensajes que no tienen nada que ver.
- **El contenido de un modal no se puede probar con `renderToStaticMarkup`**: `DialogTitle`
  de Base UI exige el contexto del diálogo. Monta el formulario **suelto**, con props.
- **Los componentes que solo se alcanzan tocando un botón deben exportarse aparte** para
  poder montarlos (así se hizo con `VistaCamara`/`VistaFallo`).
- **Efecto secundario conocido del arnés**: las pruebas de render usan `service_role`, y
  `staff_directorio` exige `auth.uid()`. Con service_role los nombres del staff salen
  vacíos y todo aparece como "sin profesor". **Es del arnés, no de la app.**
- Igual: `staff_docentes` tiene `auth.uid() is not null`, así que desde service_role
  devuelve **0 filas** y parece que los docentes desaparecieron. Hay que **simular sesión**.

---

## 10 · Migraciones — el procedimiento completo

```bash
# 1. Mirar la última versión usada (OBLIGATORIO)
ls supabase/migrations/ | tail -3

# 2. Crear el archivo con una versión POSTERIOR
#    Formato: AAAAMMDDHHMMSS_descripcion.sql

# 3. Escribir el SQL

# 4. Actualizar src/lib/database.types.ts A MANO (no es generado)

# 5. Aplicar
npm run db:apply

# 6. VERIFICAR POR API que el objeto existe. No confíes en el "ok".
```

Verificación (script one-off con la Management API y el PAT de `.env`):

```
POST https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/database/query
Authorization: Bearer $SUPABASE_ACCESS_TOKEN
{ "query": "select to_regclass('public.mi_tabla')" }
```

### Detalles que ya costaron tiempo

- **Un valor de enum nuevo va SOLO en su propia migración.** Postgres no deja **usar** un
  valor de enum en la misma transacción en que se agrega ("unsafe use of new value of enum
  type").
- **Agregar una columna de salida o un parámetro a un RPC = DROP + CREATE.**
- **Al escribir políticas nuevas**, usa `private.user_role()` — no subconsultas a `profiles`
  (chocan con la regla de `profiles_select`).
- Los **festivos** están escritos hasta 2032. **No siempre son 18** (en 2030 son 17 por un
  choque de traslados). Cuando se acaben, el cálculo **no falla**: deja de reconocer
  festivos y esas horas se pagan como día normal, en silencio.

---

## 11 · Diseño e interfaz

**Antes de tocar cualquier pantalla, lee `.interface-design/system.md`.** Resumen:

- **Dirección:** "precisión de marcador + energía de cancha". Superficies calmas.
- **Color:** Impact Lime `#d4e157` **solo para acción / estado / acento — nunca decoración
  ni superficies grandes.** Court Charcoal `#37474f`, Stadium Black `#1a1c1e` (sidebar y
  login). Fondo `#f4f6f5`, tarjetas blancas. Warning ámbar `#f2b53d`.
- **Profundidad:** una sola estrategia — **sombras suaves**. Tarjetas `shadow-sm`, modales
  `shadow-xl`, popovers `shadow-md/lg`. Nunca borders-only ni sombras dramáticas.
- **Tipografía:** Montserrat en headings (itálica mayúsculas para la voz de marca), Open
  Sans en cuerpo. **Números siempre `tabular-nums`** + `font-heading` semibold.
- **Radios:** `--radius: 0.5rem`. Botones/inputs `rounded-lg`, tarjetas `rounded-xl`,
  modales `rounded-2xl`, badges pill.
- **Espaciado:** base 4px. Secciones `space-y-6`, grids `gap-4`, contenido `max-w-7xl` con
  `p-4 md:p-8`.
- **Tablas:** envolver en `.cdaf-table-wrap` + `<table className="cdaf-table">`. El
  encabezado lo heredan los `<th>` por cascada; no estilices celda por celda.
- **Listas vacías:** usa `EmptyState` de `@/components/ui/empty-state`.
- **No tocar lógica de negocio al ajustar estilo.** Las APIs de los componentes son estables.

### Gotchas de UI que ya rompieron cosas

- **`Input` requiere strings.** Los selects son nativos con la clase
  `border-input bg-background h-9…`.
- **Fechas en componentes que se pintan en servidor Y navegador: usa
  `src/lib/fecha.ts`** (`fechaHoraCorta`, `tiempoRelativo`, `horaCorta`, `fechaLarga`,
  `saludo`). **NUNCA `Intl.DateTimeFormat("es-CO")` directo**: el español mete un espacio
  fino (U+202F) antes de "p. m." en Node pero no siempre en el navegador, React lo lee como
  texto distinto y **descarta la hidratación del árbol entero** — la pantalla deja de pintar.
- **No pintes un reloj en el servidor.** Mismo problema. Arranca vacío y llénalo al montar.
- **Las casillas múltiples van con `formData.getAll("campo")`**, no por
  `Object.fromEntries(formData)` (se queda solo con la última marcada).
- **`servicios.color` no se elige a ojo.** Hay un techo duro de ~9 colores distinguibles
  (medido por fuerza bruta, con daltonismo simulado). Al crear un servicio nuevo, corre el
  validador de paletas contra la lista existente; no inventes un hex.

### Gráficos

Son propios, en `src/app/(app)/dashboard/`: `CountUp`, `ChartArea`, `ChartBarrasSemana`,
`ChartDonut`, `RadialGauge`. **Sin librerías** — SVG + transiciones CSS. Respetan
`prefers-reduced-motion`.

---

## 12 · Integraciones

### Siigo (ERP — la verdad del dinero)

- **Sync automático**: Edge Function `siigo-sync`, invocada por pg_cron **cada 20 min**
  (incremental) y a las **08:15 UTC = 03:15 Bogotá** (refresh de saldos). Protegida con
  header `x-sync-secret`.
- **La fuente del CLI (`scripts/sync-siigo.mjs`) y la de la Edge Function comparten
  lógica: hay que mantener las dos en sintonía.** Ej.: `servicioDeProducto()` vive en los
  dos sitios.
- **Rezago conocido de ~1 día**: Siigo carga la facturación tarde, así que el marcador de
  "hoy" sale en $0 hasta el día siguiente. **No es un bug del sync.**
- Salud: `cron.job_run_details` y `net._http_response`. La UI muestra "última sync" desde
  `siigo_sync.updated_at`.
- **Las facturas NO traen `due_date`** (verificado contra su API). Por eso la antigüedad de
  cartera se cuenta desde la **fecha de la factura** y la columna se llama "Espera", no
  "vencida".
- **Descartado dos veces: el centro de costos de Siigo.** Se marca en la factura completa,
  así que a una canasta mixta le pondría "Torneos" con el banano incluido. Es más grueso que
  el grupo de producto. **No lo repropongas.**

### EasyCancha (reservas)

- El `courtName` ("Profesor Willinton - Cancha 3") da el profesor vía **`claveProfesor()`**
  (normaliza sin prefijo ni acentos) + tabla `easycancha_profesor_alias`.
- **Bloqueos de academia**: el club se auto-reserva con el usuario "BLOQUEOS ACADEMIAS"
  (correo `agentecdaf@gmail.com`). El criterio confiable es **el correo** →
  `esBloqueoAcademia()`. **`bookedBy:"club"` NO sirve** (sale así también cuando recepción
  reserva a nombre de un cliente).
- **El campo `comments` se USA para decidir pero NUNCA se muestra** en una reserva de
  cliente: ahí el club escribe datos privados ("PAGA LA PRIMERA SEMANA DE MAYO"). Se
  resuelve en el servidor y a la pantalla solo viaja un booleano. Solo se muestra el texto
  en los bloqueos de academia.
- **`pareceClase()`** distingue alquiler de clase con dos señales: (1) la cancha lleva
  profesor en el nombre; (2) si viene pelada, manda la **nota**. **Ni el nombre de la cancha
  ni el precio distinguen** — hay clases reales en cancha normal por el mismo monto que un
  alquiler. Por eso **se esconde el botón, no se bloquea**: hay un enlace "Me consta que sí
  fue una clase, registrarla".

### Resend / OpenAI

- Resend manda los correos con marca. El SMTP de Supabase **todavía no** apunta a Resend →
  no hay "olvidé mi contraseña"; el SA asigna las claves.
- OpenAI solo lo usa `/agente`.

---

## 13 · Despliegue

**Producción: https://alejandrofallacd.com** (+ `www.`). Vercel, proyecto
`centro-de-control`, equipo `centro-deportivo-alejandro-falla`, **plan Pro**.

- **Es automático: `git push` a `main` = despliegue a producción.** No hay comando ni CLI
  de Vercel ni token en `.env`. Tú llegas hasta el push; Vercel construye al ver el commit
  (~40-60 s). **Por eso "desplegar" no es una acción aparte.**
- Verificar que entró:
  ```bash
  curl -o /dev/null -w "%{http_code}" https://alejandrofallacd.com/login
  ```
  Debe dar 200, y en el panel de Vercel el último *Deployment* debe decir **Ready** con el
  hash del commit.
- ⚠️ **La URL `centro-control-cdaf.vercel.app` YA NO EXISTE** (404). Es de julio-2026, antes
  de renombrar el proyecto. Aparece en transcripciones viejas y llevó a diagnosticar
  "producción caída" cuando estaba perfecta. **Usa siempre el dominio propio.**
- Vercel solo necesita **9 variables** (ver `DESPLIEGUE.md`). Las de scripts de consola
  (`SUPABASE_ACCESS_TOKEN`, `SIIGO_*`, `PG*`, `DATABASE_URL`…) **no van a Vercel**: no
  sirven de nada allá y amplían la superficie expuesta.

### Supabase

- Proyecto `rxkfgbxdxhrirsscvfwe`, **plan Pro desde el 14-sep-2026** → ya no se pausa por
  inactividad. **9 respaldos diarios, 7 días de retención.**
- ⚠️ **`pitr_enabled` está en `false`**: Pro trae respaldo DIARIO, no recuperación al
  minuto. Si se borra algo por error se puede perder hasta un día. Decisión pendiente.
- 💡 **Restaurar da un susto**: el proyecto pasa por `COMING_UP` con la base **VACÍA** antes
  de entrar en `RESTORING`. **Vacío NO es pérdida** — hay que esperar a `ACTIVE_HEALTHY`.
  **No corras migraciones ni escribas nada durante la ventana.**

### Buckets de Storage

| Bucket | Visibilidad | Contenido |
|---|---|---|
| `avatares` | **PÚBLICO** (el único) | Fotos de perfil. Público a propósito: se pintan en el header de todas las pantallas y una URL firmada habría que renovarla en cada carga. Escritura restringida a la carpeta propia (`<uid>/…`). |
| `turnos` | Privado | Fotos de marcación. Dato sensible (Ley 1581) → enlaces firmados + **borrado automático a los 45 días**. |
| `cliente-docs` | Privado | Documentos de clientes. |
| `evento-docs` | Privado | Soportes de gasto de eventos. |

Ningún bucket tiene `file_size_limit` propio (usan el global del proyecto).

### Tareas programadas (pg_cron)

| Tarea | Cuándo | Qué hace |
|---|---|---|
| `siigo-sync` incremental | cada 20 min | Trae facturas nuevas |
| `siigo-sync` saldos | 08:15 UTC (03:15 Bogotá) | Refresca saldos |
| `turnos-limpiar-fotos` | 07:40 UTC (02:40 Bogotá) | Borra fotos de más de 45 días |
| `paquetes_marcar_vencidos` | 06:15 UTC (01:15 Bogotá) | `activo → vencido` por fecha |

---

## 14 · Reglas de negocio que no puedes deducir del código

Estas son **decisiones de Laura / del club**. No las cambies por iniciativa propia.

### Dinero

- **Siigo manda.** El cálculo interno de saldos está muerto.
- **Un evento se mide por CONTRIBUCIÓN, no por inscripción pura.** Se ata la factura
  **completa** al torneo (incluida la cafetería de esa persona), porque *si no hubiera
  torneo, esa persona no habría estado en el club consumiendo*. Por eso `evento_id` vive en
  `siigo_facturas` y **no** en `siigo_factura_lineas`. **Está zanjado: no repropongas
  partir por línea.**
- **Un gasto de evento puede ir en $0**: sirve para dejar constancia de lo que cubrió un
  patrocinador.
- **Inscribir NO es haber pagado.** `monto` es lo que debe; `estado` dice si entregó.
- **El cierre de un evento congela un snapshot** (`cierre_ingreso/costo/utilidad`) para que
  una factura tardía no mueva un mes ya publicado. Para corregir hay que **reabrir**.
- **El dashboard solo ve la utilidad de los eventos CERRADOS** y avisa cuánto hay retenido
  en los abiertos.
- **Conciliación manual = solo deudas y facturas con cliente identificado.** El mostrador
  anónimo queda cerrado como ingreso (pero siempre conciliable a mano).

### Academias

- **4 academias fijas**: recreativa/competencia × tenis/pádel. Cada una apunta a su grupo de
  producto de Siigo, no a un precio interno.
- **Los rangos de edad los pone el club por grupo y PUEDEN SOLAPARSE.** No hay bandas
  globales (medido: cualquier banda parte entre 16 y 33 de las 60 franjas reales).
- **El cupo (Iniciación 6 · Intermedio 5 · Avanzado 4) NO bloquea, AVISA.**
- **Borrar un GRUPO se rechaza si tiene niños**; borrar una FRANJA sí se deja (el niño
  pierde ese día, no la inscripción). Son dos cosas distintas a propósito.
- **La academia y el profesor se escogen SIEMPRE a mano** en el modal de `/clases`.
  Adivinarlos sube el margen de error.
- Falta: **academias de pádel** (Laura las dejó para después).

### Clases y cierre

- **Piso**: no se puede cerrar una clase ANTES de que empiece. Sin esto se marcaba
  asistencia por la mañana de una clase de la tarde.
- **Techo**: pasadas **24 h** desde el inicio, solo el superadministrador registra.
- **El mismo techo de 24 h rige para corregir el valor y el cobro** de una clase, a
  propósito: **una sola regla que recordar**.
- **El club cobra POR PERSONA**: 1 persona $130.000, 2 personas $150.000. Por eso
  "Personas" y "Precio" se editan **juntos** — en el club son la misma corrección.
- **El precio se pre-llena con el `totalAmount` de EasyCancha** (antes arrancaba en "0" y
  registrar sin teclear dejaba la clase en $0, y con una regla `pct_facturado` el profesor
  cobraba $0 en silencio). Ojo: ese monto es la tarifa de la reserva, **un punto de partida,
  no un dato firme**.

### Nómina de entrenadores

- **El ROL dice qué VE; las REGLAS dicen cómo se le PAGA.** No son la misma pregunta. Un
  coordinador puede dictar clases. `esDocente()` entra por **rol profesor O reglas activas O
  compensación vieja** — es aditivo a propósito.
- **El concepto exacto le gana al comodín `clase`, sin importar el `orden`.** Antes ganaba
  el primero por orden y una "comisión del 50% de las 7 a.m." tapaba la regla de academia,
  pagando $60.000 donde iban $0.
- **Todo el que dé academia necesita regla de academia, aunque sea en $0.** Sin ella, "$0
  porque va en su salario" y "$0 porque falta configurar" se ven idénticos.
- **Las reglas se DESACTIVAN, no se borran**: la liquidación de quincenas pasadas tiene que
  poder explicarse.
- **No hay tabla de liquidación** (se calcula al vuelo), así que **no se puede saber por
  código si una quincena ya se pagó**. El plazo de 24 h es el sustituto de ese candado.

### Turnos del personal

- Marcan **cuatro personas** (cafetería, coord. admin, recepción, vigilante). **Los
  profesores NO marcan.**
- **Quién marca lo dice `profiles.marca_turno`, persona por persona**, NO el rol.
- **La hora la pone el servidor, SIEMPRE.** Las tablas no tienen permiso de escritura para
  nadie; se escribe solo por funciones `SECURITY DEFINER` que estampan `now()`. Si la hora
  viniera del formulario, bastaría con atrasarle el reloj al celular.
- **El empleado NO ve cuántas horas lleva** (decisión de Laura). Va en la BASE, no solo en
  la pantalla.
- **Un turno abierto aporta CERO horas**: no se inventa la hora de salida.
- **Cerrar el turno con el almuerzo abierto está BLOQUEADO a propósito**: las dos salidas
  posibles están mal (contar la pausa en cero le paga el almuerzo; estirarla le quita horas).
- Normativa codificada: semana **lun–dom**, máx **42 h** (Ley 2101/2021); diurna
  **6:00–18:59**, nocturna **19:00–5:59** (Ley 2466/2025); dominical y festivo **+90%**.
  El cálculo va **minuto a minuto** en `turnos_horas`.
- **`turno.origen` NO dice el aparato, dice la PUERTA**: `app` = con su usuario (desde donde
  sea), `quiosco` = pantalla compartida con PIN, `ajuste` = lo escribió el SA.

### Notas

- **Etiquetar con @ = asignar responsable. Sin etiquetar = tablón general** (se reparte a
  todo el staff activo menos el autor).
- **Leer ≠ resolver.** `leida_el` alimenta la campanita; el estado alimenta la bandeja.
- **EDITAR ≠ RESOLVER**: `puedeEditar = esAutor`; `puedeResolver` = autor, admin o
  destinatario.
- **Un comentario en el tablón general NO re-avisa a los nueve.**

---

## 15 · El flujo de trabajo, paso a paso

### Antes de empezar cualquier tarea

1. Lee este documento (ya lo estás haciendo).
2. **Busca el módulo en `MEMORIA.md`.** Casi todo lo que vas a tocar tiene ahí su historia,
   sus decisiones y sus trampas.
3. Si es UI: lee `.interface-design/system.md`.
4. Si es Next.js: lee la guía en `node_modules/next/dist/docs/`.
5. Si vas a usar una librería: consulta su documentación actual (Context7 MCP), no tu memoria.

### Mientras trabajas

- **Escribe en español**, código y comentarios incluidos.
- **Comenta el PORQUÉ, no el qué.** El estilo del repo documenta las decisiones y las
  trampas medidas, no la sintaxis. Mira cualquier archivo de `src/lib/` como referencia.
- **Busca antes de crear.** Una segunda copia de una función de normalización ya rompió
  cosas dos veces.
- **Si encuentras algo torcido fuera de tu tarea, anótalo — no lo arregles sin preguntar.**

### Antes de commit — la lista completa

```bash
npm run build     # 1. compila
npm test          # 2. las pruebas (NO a la vez que el build)
```

3. Si tocaste el esquema: `db:apply` **+ verificación por API** + `database.types.ts` al día.
4. Si tocaste permisos: los tres greps de §7.2.
5. Si tocaste una pantalla: ¿tiene su prueba de render?
6. Si tocaste algo que Laura decidió: ¿sigue respetando su decisión?

### Commit

- Se trabaja en **`main`**. Commit al terminar cada bloque verificado, y push.
- **Mensajes en español**, con la firma que corresponda al modelo que lo escribe, p. ej.:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  ```
- Recuerda: **push a `main` = despliegue a producción**. No hagas push de trabajo a medias.

---

## 16 · Estado actual y pendientes

Al **16 de septiembre de 2026**: 254 commits, 99 migraciones, 16 archivos de prueba.
La plataforma está en uso diario.

### Pendientes abiertos (detalle en `MEMORIA.md`)

- ⏸️ **Reglas de pago de Yeison Bedoya y Esteban Graciano** — EN PAUSA, el club las revisa.
  **Yeison tiene 0 reglas y ya hay una clase cerrada que le paga $0.** Es lo primero al
  retomar.
- **Barrer las clases particulares anteriores al 15-sep-2026** comparando `clases.precio`
  contra el `totalAmount` de su reserva. Hasta ese día el precio arrancaba en "0".
- **Cargar los correos reales de los profesores** y darles contraseña (hoy Juan Cruz tiene
  `test@gmail.com` y no puede entrar).
- **Preguntarle al club quién es "Mauricio"** (1 reserva sin perfil, no se le puede crear
  alias).
- **Rotar tokens expuestos en chat**: PAT de Supabase y access_key de Siigo.
- **Apuntar el SMTP de Supabase a Resend** → habilita "olvidé mi contraseña".
- **9 fichas de clientes duplicadas dudosas** sin fusionar, a la espera del club.
- **Academias de pádel** (aplazadas por Laura).
- **Importador del Excel de academias** y cruce asistencia vs. facturas de Siigo (este
  último bloqueado por conciliación: solo 36 de 224 líneas tienen `cliente_id`).
- **Decidir sobre PITR** en Supabase (hoy solo respaldo diario).

### Cosas que se decidieron NO hacer (no las repropongas)

- Centro de costos de Siigo para eventos (descartado **dos veces**).
- Partir la factura de torneo por línea.
- Entidad "grupo" oculta en academias — *se revirtió*: hoy **sí** existe `academia_grupo`.
- Tablero de rendimiento por franja (**aparcado**: el RPC existe y está verificado, pero
  ninguna pantalla lo llama; en agosto se registraron 2 clases de academia de ~250, así que
  cualquier tablero muestra rayas). La regla que lo zanjó: **un aviso donde no está la
  acción es solo carga.**
- Excepciones de permisos por usuario (los permisos son por ROL, punto).
- Regla de paquetes para Victor Acosta ("de momento dejémoslo así" — Laura, 16-sep-2026).

---

## 17 · Glosario

| Término | Qué significa aquí |
|---|---|
| **Ficha** | Una fila de `clientes`. Es una **cuenta familiar**, no una persona. |
| **Miembro** | Una fila de `cliente_miembros`. La **persona** (el niño, el titular, el hermano). |
| **Bloqueo** | Reserva que el club se hace a sí mismo en EasyCancha para dictar academia. |
| **Materializar** | Convertir una reserva de EasyCancha en una `clase` de la plataforma. |
| **Cerrar una clase** | Registrar la asistencia. Es lo que después se liquida y se cobra. |
| **Conciliar** | Atarle un `cliente_id` a una factura de Siigo por su NIT. |
| **Atar** (una factura a un evento) | Poner `evento_id`. **No concilia** — una mostrador sigue anónima. |
| **Mostrador** | Factura de pago anónimo. No aparece en la cola de conciliación. |
| **Canasta mixta** | Factura con varias cosas (inscripción + cafetería + almacén). |
| **Franja** | Un día+hora de un grupo de academia, con su profesor y cancha. |
| **Quiósco** | El PC de recepción con sesión abierta para marcar turnos. Es un **rol**. |
| **Liquidación** | El cálculo de cuánto se le paga a cada entrenador en un periodo. |
| **Regla** | Una fila de `profesor_regla`: cómo se le paga a un entrenador un concepto. |

---

## 18 · Resumen para memorizar

Si solo te llevas diez frases:

1. **Está en producción con dinero real. Verifica antes de afirmar.**
2. **Una lectura rechazada por RLS devuelve 0 filas sin error. Una escritura rechazada no
   escribe y sigue de largo.** Mira siempre el `error`.
3. **El guardia de la página no protege la Server Action.** Valida el rol en las dos.
4. **Cambiar la matriz de permisos no cambia las políticas de la base.** Son dos capas.
5. **Toda suma va en un RPC SQL.** PostgREST corta a 1.000 filas en silencio.
6. **El build en verde no significa que la página abra.** Corre `npm test` también.
7. **Antes de nombrar una migración, mira la última versión usada.** Repetirla la salta en
   silencio.
8. **Una segunda copia de una función de normalización es una bomba de tiempo.** Busca antes
   de crear.
9. **Dos situaciones que se arreglan distinto no pueden verse iguales** en pantalla.
10. **Lo que Laura decidió, se respeta.** Si crees que está mal, díselo — no lo cambies.

---

*Mantén este documento vivo: si aprendes algo que habría evitado un daño, escríbelo aquí y
la historia detallada en `MEMORIA.md`.*
