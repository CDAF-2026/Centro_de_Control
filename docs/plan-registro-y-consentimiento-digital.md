# Plan · Registro de datos y consentimiento informado por QR

> **Estado: Fases 0, 1 y 2 hechas el 1-oct-2026. La página pública está desplegada pero cerrada (falta `REGISTRO_PUBLICO=1` en Vercel). Siguiente: Fase 3.**
> Escrito el 30-sep-2026 a partir del video de Laura (30-sep-2026, 5:44 min), el
> texto del consentimiento y la ficha personal que aparecen en él, y una lectura
> completa de `handoff.md`, `MEMORIA.md` y el código del módulo de clientes.
>
> Cómo usar este documento: se revisa entero, se contestan las decisiones de la
> §2, y después se ejecuta **fase por fase** (§6), verificando cada una antes de
> pasar a la siguiente. Cada fase deja la plataforma funcionando y desplegable.

---

## 0 · Resumen en una página

**Qué se construye.** Una página pública (sin clave) a la que se llega por un
código QR impreso en el club. Ofrece dos caminos:

1. **Actualizar o ingresar datos** → el papá llena la ficha del niño (o la suya)
   → la plataforma crea la ficha si no existe, o la completa si ya existe → lo
   pasa directo a firmar el consentimiento.
2. **Consentimiento informado** → lee el texto, marca "Apruebo", firma con el
   dedo (o escribe su nombre si está en un computador) → la plataforma genera un
   PDF con la firma y la evidencia, y lo deja adjunto en la ficha del niño.

Con dos hijos: se hace una vez por hijo y la ficha familiar queda con dos PDF.

**Cómo encaja con lo que existe.** Se apoya en lo que ya hay: `clientes`,
`cliente_miembros` (los niños), `acudientes`, `cliente_documentos` y el bucket
privado `cliente-docs`. La búsqueda de la persona reutiliza la que ya evita
duplicados (`buscarClienteDeReserva`: correo → cédula). No se crea un sistema
paralelo.

**Lo delicado.** Es la **primera pantalla pública que escribe en la base**. Por
eso el plan la trata como una puerta vigilada, no como un formulario más:

- La página **nunca muestra** datos que ya existen (nadie puede consultar la
  ficha de otro escribiendo una cédula).
- En fichas existentes **lo que escribe el papá reemplaza lo que había** (D1),
  con el valor anterior guardado en la auditoría. La **única excepción es la
  facturación**: un NIT distinto al que ya había espera aprobación en una
  **bandeja** del superadmin / coord. administrativo. Nunca mueve facturas de
  Siigo por sí sola.
- Toda escritura entra por **funciones de la base con un solo trabajo**
  (`SECURITY DEFINER`, invocables solo por el servidor), no por acceso directo a
  las tablas. La clave pública (`anon`) no recibe ni un permiso nuevo.
- La firma se guarda con **evidencia** (quién, cuándo según el servidor, desde
  dónde, qué versión del texto, huella del PDF) en un almacén **de solo
  escritura**: ni el personal puede borrarla.

**Cifras del estado actual (medidas el 30-sep-2026, solo lectura):** 506 fichas ·
560 miembros activos · 142 niños en academias · 44 fichas con hermanos · 129 con
acudiente · **0 documentos** cargados hasta hoy · 384 fichas sin EPS y 385 sin RH.

**Fases:** 0 Decisiones → 1 Cimientos (base de datos) → 2 Consentimiento público →
3 Formulario de datos + bandeja → 4 QR y salida a producción → 5 Opcionales.
Estimación total de las fases 1–4: **75–100 horas** (la unificación de la ficha entró a la Fase 1; la bandeja se achicó).

---

## 1 · Lo que dijo Laura, punto por punto (fuente: el video)

| # | Requisito | Dónde lo resuelve el plan |
|---|---|---|
| R1 | Un QR abre una landing con dos opciones: *Actualizar datos* y *Consentimiento informado* | §4.1 rutas · Fase 2 y 4 |
| R2 | *Actualizar datos* abre un formulario con **los mismos campos de la ficha** (nombre, documento, nacimiento, RH, EPS, padres, facturación…) | §4.4 campos · Fase 3 |
| R3 | Si el cliente **no existe → se crea**; si **ya existe → se actualiza** | §4.5 reglas de aplicación · Fase 3 |
| R4 | Tras guardar los datos, **pasa directo** a firmar el consentimiento | §4.3 sesión del recorrido · Fase 3 |
| R5 | El consentimiento tiene el **texto**, un **"chulito" de aprobación** y **firma digital con el dedo** desde el celular | §4.6 firma · Fase 2 |
| R6 | Al firmar se **genera un PDF** | §4.7 PDF · Fase 2 |
| R7 | El PDF se **busca al cliente y se adjunta a su ficha** | §4.8 adjunto · Fase 2 |
| R8 | No todos los papás tienen ficha propia; hay que buscar **entre la ficha del padre, la del hijo o la de los hermanos** | §4.5 búsqueda · Fase 2 y 3 |
| R9 | Un papá con **dos hijos** llena los datos y firma **por cada uno**; la ficha queda con **dos PDF** | §4.3 cadena de hermanos · §4.8 un PDF por miembro · Fase 3 |
| R10 | Si ya tiene los datos al día, elige **solo consentimiento**: firma, se genera el PDF, se busca al padre o al niño y se adjunta | Fase 2 (camino directo) |

Cosas que Laura **no dijo** y el plan asume (confirmar en §2): que el club está
de acuerdo con que la página no muestre datos existentes; que los cambios a
datos ya llenos pasen por revisión; que el texto del consentimiento del video es
el definitivo.

---

## 2 · Decisiones — TOMADAS por Laura el 1-oct-2026 (Fase 0 cerrada)

Insumos definitivos: `Consentimiento informado/insumos/CONSENTIMIENTO INFORMADO
MENORES DE EDAD .docx` (texto legal, versión 2026-10) y `FICHA PERSONAL 2026.docx`
(campos del club). Coinciden con lo que aparece en el video.

| # | Decisión | Consecuencia en el plan |
|---|---|---|
| D1 | **Sobrescribir todo, excepto facturación.** Lo que el papá escribe reemplaza lo que había (celular, correo, EPS, RH, documento…). El bloque de facturación (razón social, NIT, correo de facturación) se llena solo si estaba vacío; si ya había un NIT distinto, el cambio espera aprobación | Desaparecen los "cambios pendientes" genéricos; la bandeja solo revisa facturación (§4.5, §4.10) |
| D2 | **Unificar la ficha con el Word.** La ficha gana los campos del papel (padre y madre por separado, lugar de nacimiento, dirección) **sin perder ninguno de los que ya tiene**. La landing es un **espejo exacto** de la ficha unificada | Lo que era la opcional 5.1 entra en la **Fase 1** (§4.4, §4.9) y el formulario del personal (`cliente-form.tsx`) también muestra los campos nuevos |
| D3 | *Solo consentimiento* y **no se encuentra** → se le manda a llenar datos. Si hay **dos** candidatos con el mismo documento **y** el mismo nombre (una ficha duplicada), la firma queda guardada "por asignar" | Caso extremo: hoy no existe ninguno. No se construye pantalla propia: aparece en la misma bandeja con un botón "Asignar" |
| D4 | **Solo padres por menores.** La página se construye para niños de academias y clases particulares | Sin interruptor "firmo por mí mismo" |
| D11 | **Mayores de 18 en academias**: medido el 1-oct-2026, de 152 matriculados activos 133 son menores, **0** tienen 18 o más y 19 no tienen fecha de nacimiento. Si la fecha de nacimiento da 18 o más, el formulario deja de pedir acudiente y la persona firma por sí misma **con el mismo texto** (ya dice "en nombre propio o en calidad de titular de la patria potestad") | Misma pantalla adaptada a la edad; sin segundo documento |
| D5 | Copia del PDF al correo: **después, opcional** (Fase 5.3) | Depende de la cuenta de Resend del club |
| D6 | Texto del Word **definitivo y revisado**; se firma **una vez** | Se carga como versión `2026-10`; versionado por si cambia |
| D7 | **Firma + evidencia** (nivel 1), sin costo | §4.6 tal cual |
| D8 | Revisan la bandeja **superadmin y coordinador administrativo** | Guardia: lista propia `PUEDE_REVISAR_REGISTROS` (patrón `PUEDE_REABRIR_EVENTO`), no la matriz de clientes |
| D9 | **Sí** va una casilla obligatoria de tratamiento de datos en el formulario | Texto propuesto en §4.4; Laura lo aprueba |
| D10 | Una firma **se conserva siempre**; al fusionar fichas, sigue a su miembro | Regla documentada |
| D12 | **Padre o madre: al menos uno**, el otro opcional. Quien diligencia es el principal y es quien firma | §4.4 |

---

## 3 · Principios que gobiernan el diseño

Vienen de `handoff.md` y de lo que este proyecto ya pagó. Cualquier cambio al
plan tiene que respetarlos.

1. **La página pública no tiene sesión ni rol.** Por eso no usa `requireRole`
   ni el cliente de Supabase con cookies: usa el cliente de servicio
   (`createAdminClient`) **solo dentro de server actions**, y ese cliente **solo
   llama funciones SQL con un trabajo acotado**. Nunca `from("clientes").update`
   directo desde el camino público.
2. **`anon` no recibe permisos nuevos.** Todas las tablas nuevas nacen con
   `revoke all from anon, authenticated` (lección de la migración 0082: en este
   proyecto "no dar grants" no cierra nada). Lo que el personal necesita ver se
   abre con políticas explícitas, con sus dos mitades (`using` y `with check`).
3. **Dos situaciones que se arreglan distinto no pueden verse iguales.** Una
   ficha creada, una completada, una con cambios en revisión y una firma sin
   dueño son cuatro estados con nombre, en la base y en pantalla.
4. **Toda escritura mira su `error`.** Una firma que "se guardó" sin PDF, o un
   PDF sin fila, se detecta y se le dice al papá que vuelva a intentar.
5. **Buscar antes de crear.** La búsqueda del adulto reutiliza
   `buscarClienteDeReserva` (correo → cédula). La del niño se escribe UNA vez en
   `src/lib/registro/` y la usan los dos caminos. Nada de una segunda copia de
   la normalización de nombres.
6. **La hora la pone el servidor.** Igual que en turnos: el momento de la firma
   es `now()` de Postgres, no el reloj del celular.
7. **La evidencia es de solo escritura.** El PDF y la imagen de la firma viven en
   un bucket sin política de `update`/`delete` para nadie con sesión. Anular una
   firma es un **estado con motivo**, no un borrado.
8. **Sin datos personales en la URL.** El recorrido se hilvana con una cookie
   `httpOnly` que solo lleva un identificador aleatorio.
9. **La ficha sigue mandando.** Se conservan el trigger `clientes_crear_titular`
   (toda ficha nace con su titular), el CHECK "menor exige acudiente" y el
   patrón "el titular vive en `clientes` y en `cliente_miembros`".
10. **Nada se despliega a medias.** Cada fase termina con `npm run build` y
    `npm test` en verde (uno después del otro), migraciones verificadas por API
    y `database.types.ts` actualizado a mano.

---

## 4 · Diseño técnico

### 4.1 · Rutas y archivos nuevos

Todo lo público vive **fuera de `(app)`**, como `/quiosco`: sin menú, sin
encabezado, sin `requireProfile`.

```
src/app/registro/
  layout.tsx                 # marca CDAF, fondo stadium, sin navegación
  page.tsx                   # LANDING: dos botones (R1)
  datos/
    page.tsx                 # formulario de datos (R2)
    actions.ts               # enviarDatos()  → busca/crea/completa → cookie → redirect
  consentimiento/
    page.tsx                 # identificación + texto + "Apruebo" + firma (R5)
    actions.ts               # firmarConsentimiento() → firma → PDF → adjunto
    firma-pad.tsx            # "use client": lienzo de firma (dedo / mouse / escrita)
  listo/
    page.tsx                 # confirmación + "¿Registrar otro hijo?" (R9)
  cerrado/
    page.tsx                 # "En preparación": se muestra si no hay texto vigente

src/lib/registro/
  esquemas.ts                # zod: datos, consentimiento, límites de tamaño
  match.ts                   # búsqueda niño/adulto/familia (lógica pura + consultas)
  aplicar.ts                 # llama a los RPC y arma el resultado
  sesion.ts                  # cookie del recorrido (crear, leer, cerrar)
  evidencia.ts               # ip, user-agent, hash — sin PII en logs
  limites.ts                 # rate limit (llama registro_permitido)

src/lib/pdf/
  consentimiento-pdf.tsx     # plantilla del PDF (@react-pdf/renderer) + hoja de evidencia
  fonts/                     # Montserrat / Open Sans (.ttf, licencia OFL) — si se usan

src/app/(app)/clientes/
  registros/                 # BANDEJA DE REVISIÓN (Fase 3)
    page.tsx · actions.ts · solicitud-card.tsx · cambios-form.tsx
  [id]/consentimientos.tsx   # estado por miembro + enlace al PDF (Fase 2)

scripts/qr-registro.mjs      # genera el QR (Fase 4)
tests/registro-*.test.ts(x)  # ver §7
```

Ajustes en archivos existentes:

| Archivo | Cambio |
|---|---|
| `src/lib/supabase/middleware.ts` | `PUBLIC_PATHS` += `"/registro"` (hoy: `/`, `/login`, `/styleguide`, `/auth`) |
| `src/lib/audit.ts` | Nueva `logAuditSistema()` con el cliente admin y `actor_id = null`: `logAudit()` **retorna sin escribir** si no hay usuario, y en el camino público no lo hay |
| `src/lib/database.types.ts` | Tablas, enums y RPC nuevos (a mano) |
| `src/app/(app)/clientes/[id]/page.tsx` | Tarjeta "Consentimientos" por miembro; documentos con nombre del miembro y bucket correcto |
| `src/app/(app)/clientes/[id]/documentos.tsx` | Muestra `miembro`; oculta "Eliminar" en documentos de origen `firma_digital` |
| `src/app/(app)/clientes/actions.ts` → `deleteDocumento` | Rechaza borrar documentos de origen `firma_digital` (la base también lo impide) |
| `src/lib/nav.ts` | Entrada "Registros por revisar" (módulo `clientes`) con contador de pendientes |
| `next.config.ts` | Posible `serverExternalPackages` para la librería de PDF (verificar con la documentación de Next 16 en `node_modules/next/dist/docs/`) |
| `package.json` | `signature_pad`, `@react-pdf/renderer` (o `pdf-lib`), `qrcode` (dev) |

### 4.2 · Arquitectura de la escritura pública

```
Navegador (papá)                 Servidor (Vercel, Node)                     Postgres / Storage
────────────────                 ───────────────────────                     ──────────────────
formulario ── POST ──▶ server action
                       1. zod: forma, tamaños, honeypot
                       2. registro_permitido(ip_hash)  ──────────────────▶  cuenta intentos (RPC)
                       3. match.ts: ¿quién es? ─────── SELECT (admin) ───▶  clientes / miembros / acudientes
                       4. registro_solicitud_crear(payload) ─────────────▶  fila con estado 'recibida'
                       5. registro_aplicar_datos(solicitud, decisión) ───▶  UNA transacción:
                                                                              crea ficha / sobrescribe /
                                                                              encola cambios / audita
                       6. cookie httpOnly {sesion, miembro}
              ◀── redirect /registro/consentimiento
```

- **Por qué el matching va en TypeScript y la aplicación en SQL.** La búsqueda
  reutiliza `buscarClienteDeReserva` (TS) y necesita reglas legibles y con
  pruebas de lógica pura; la aplicación necesita **atomicidad** (ficha +
  acudiente + miembro + cambios pendientes + auditoría en una transacción), y
  supabase-js no da transacciones: por eso es un RPC, como `profesor_reglas_aplicar`.
- **Por qué hay una tabla de solicitudes.** Es el rastro de **cada envío** con lo
  que llegó tal cual, independiente de lo que se aplicó. Sirve para la bandeja,
  para reintentar, y para explicar "por qué esta ficha dice X".
- **Los RPC públicos son invocables solo por `service_role`**: `revoke all …
  from public, anon, authenticated`. El navegador nunca habla con Supabase.

### 4.3 · La sesión del recorrido (cookie)

- Nombre `cdaf_registro`; `httpOnly`, `secure`, `sameSite=lax`, `path=/registro`,
  vida **2 horas**. Contenido: `{ sesion: uuid }`. Nada más.
- La fila `registro_sesion` guarda: `id`, `creada_el`, `expira_el`,
  `miembros jsonb[]` (los niños ya procesados: `{miembro_id, cliente_id, nombre}`)
  y `firmante jsonb` (nombre, documento, parentesco, celular, correo — para no
  pedirlos otra vez con el segundo hijo).
- `/registro/consentimiento` **exige** una sesión válida cuando viene del
  formulario (sabe por quién se firma). Cuando se entra directo desde la landing
  (R10), pide la identificación y crea la sesión ahí.
- `/registro/listo` ofrece "Registrar otro hijo": vuelve a `/registro/datos` con
  los datos del firmante precargados desde la sesión (nunca desde la URL).
- Al terminar ("No, gracias") se borra la cookie y la fila queda `cerrada`.

### 4.4 · Campos del formulario de datos (R2) y su destino

**La ficha unificada (D2)** = lo que la ficha ya tiene + lo que trae `FICHA
PERSONAL 2026.docx`. La landing pública y el formulario del personal muestran
exactamente estos campos.

| Campo | Origen | Destino en la base |
|---|---|---|
| Nombres · apellidos del menor | ambos | `cliente_miembros.nombres/apellidos` (titular: también `clientes`) |
| Tipo y nº de documento (RC/TI/CC…) | ambos | `documento`, `tipo_documento` |
| Fecha de nacimiento | ambos | `fecha_nacimiento` |
| **Lugar de nacimiento** | Word | **nuevo** `cliente_miembros.lugar_nacimiento` (y espejo en `clientes` para el titular) |
| **Dirección de residencia** | Word | **nuevo** `clientes.direccion` (es de la familia) |
| Nombre y celular para contacto (+ parentesco) | ambos | `emergencia_nombre`, `emergencia_celular`, `emergencia_parentesco` |
| EPS · RH | ambos | `eps`, `rh` (lista cerrada `O+ … AB-`) |
| **Padre**: nombre, cédula, celular, correo | ambos (hoy un solo acudiente) | **nueva** tabla `cliente_acudientes` (ficha ↔ acudiente, `rol` padre/madre/otro, `principal`); `acudientes.email` ya existe |
| **Madre**: nombre, cédula, celular, correo | Word | ídem, segunda fila |
| Celular y correo de la ficha | plataforma | `clientes.celular/email` = los del acudiente principal (como hoy) |
| Facturación: natural/jurídica, razón social, NIT, correo | ambos | `factura_tipo`, `factura_a_nombre`, `factura_a_nit`, `factura_email` |
| Deportes (tenis/pádel) | plataforma | `deportes[]` |
| Estado (activo/retirado) | plataforma | **no** se expone en la landing |

Migración de lo existente: `clientes.acudiente_id` se conserva (el CHECK "menor
exige acudiente" lo usa) y se **espeja** como la fila `principal` de
`cliente_acudientes` con `rol = 'otro'` cuando no se sepa si es padre o madre
(129 fichas hoy). El formulario del personal (`cliente-form.tsx`) pasa a mostrar
dos bloques (padre / madre) y la ficha los lista.

Reglas del formulario (todas se validan **en el servidor** con zod, igual que
`createClienteSchema`):

- Obligatorios: nombres, apellidos, tipo y nº de documento del niño, fecha de
  nacimiento, EPS, RH; **al menos un acudiente** (D12) con nombre, cédula,
  celular y correo; casilla D9.
- Opcionales: segundo acudiente, lugar de nacimiento, dirección, contacto de
  emergencia, facturación (NIT solo dígitos), deportes.
- **Edad ≥ 18 (D11)**: se ocultan los bloques de padre/madre; la persona es su
  propio firmante (nombre y cédula del menor = los del firmante).
- Longitudes máximas por campo; documento y NIT solo dígitos; correo en
  minúsculas; celular normalizado a 10 dígitos (misma regla de la fusión de
  duplicados del 15-sep).
- Honeypot: un campo invisible `sitio_web`; si llega lleno, se responde "listo"
  sin guardar nada (no se le avisa al robot).
- Casilla D9, texto propuesto (Laura aprueba): *"Autorizo al Centro Deportivo
  Alejandro Falla el tratamiento de estos datos para la gestión de las
  actividades deportivas, conforme a la Ley 1581 de 2012."*

### 4.5 · Búsqueda y reglas de aplicación (R3, R8)

**Búsqueda (`src/lib/registro/match.ts`, con pruebas de lógica pura):**

```
1. NIÑO por documento (solo dígitos) en cliente_miembros (titulares incluidos)
     1 resultado  → ese miembro (aunque el nombre venga distinto: "SIMON VÉLEZ"/"Simon Velez")
     >1 resultado → desempata por nombre normalizado (sin tildes, minúsculas, sin dobles espacios)
                    · sigue ambiguo → AMBIGUO
     0 resultado  → 2
2. NIÑO por nombre normalizado + fecha de nacimiento exacta
     1 → ese miembro · >1 → AMBIGUO · 0 → 3
3. ADULTO (firmante) con buscarClienteDeReserva(correo → cédula) sobre `clientes`,
   y además cédula sobre `acudientes` → su ficha familiar
     encontrado → el niño se crea como HERMANO en esa ficha
     no encontrado → 4
4. NUEVO: ficha nueva con el niño como titular y el adulto como acudiente
   (misma convención de las fichas de academia: p. ej. ficha 430 Elena Restrepo,
   acudiente Daniela Caicedo; el celular/correo de la ficha son los del acudiente)
```

⚠️ `clientes.documento` **no tiene índice único** (medido): por eso el paso 1
contempla más de un resultado. Mismo cuidado que el importador del planeador:
el documento se cruza **junto con el nombre** (tres pares de hermanos comparten
documento en los datos reales).

**Aplicación (`registro_aplicar_datos`, un RPC, una transacción).** Con D1 =
sobrescribir todo salvo facturación:

| Situación | Qué hace la función | Estado resultante |
|---|---|---|
| Ficha nueva (paso 4) | `insert acudientes` (1 o 2) → `insert clientes` (el trigger crea el titular) → `cliente_acudientes` → deportes, emergencia, dirección → facturación **solo si el NIT no está en uso** (`choqueNitFacturacion` se reimplementa en SQL como `private.nit_en_uso(nit, excluir)`; si está en uso, el bloque va a revisión y no se guarda) | `aplicada` · `{creada: true}` |
| Hermano nuevo en ficha existente (paso 3) | `insert cliente_miembros (es_titular=false)` con sus datos; los datos de la familia (acudientes, dirección, emergencia, facturación) se aplican con la regla de la fila siguiente | `aplicada` |
| Miembro existente (pasos 1–2) | **Todo lo que llega reemplaza lo que había** (`before` completo en `audit_log`). Excepción única: **facturación** — vacía → se llena; igual → nada; **NIT distinto → fila en `registro_cambio` (pendiente)**, y mientras tanto no se toca | `aplicada` · `en_revision` solo si hubo cambio de NIT |
| Ambiguo (mismo documento **y** mismo nombre en dos fichas = duplicado) | No escribe en `clientes`. Guarda los candidatos en `resultado` | `en_revision` · nota automática a los revisores |

Lo que **nunca** hace el camino público:

- `reatribuirFacturas` (mover facturas de Siigo). Si un revisor aprueba un
  cambio de NIT en la bandeja, esa acción —ya con sesión— corre la lógica
  existente de `updateCliente`/`reatribuirFacturas` con su auditoría.
- Cambiar `estado` (activo/retirado), paquetes ni inscripciones.
- Borrar nada (un acudiente que ya no venga en el formulario **se conserva**;
  quitarlo es tarea del personal desde la ficha).

La función también escribe en `audit_log` (`actor_id = null`, `action =
'registro.aplicar'`, `after` con el resumen: creados, llenados, pendientes) y,
si el estado es `en_revision`, deja una nota automática (§4.10).

### 4.6 · La firma (R5) — firma electrónica con evidencia

Marco legal (orientación técnica, no jurídica): **firma electrónica** según la
Ley 527/1999 art. 7 y el Decreto 2364/2012 — válida si permite identificar al
firmante y probar que aceptó el texto, y si el documento se conserva íntegro.
No es "firma digital" con certificado (eso exigiría que cada papá comprara uno).

**Componente `FirmaPad` (cliente):**

- Librería **`signature_pad`** (la más usada, sin dependencias, suaviza el
  trazo). Un solo lienzo responde a **dedo, mouse, trackpad y lápiz**.
- `touch-action: none` en el lienzo para que la página no se desplace al firmar
  en el celular; lienzo escalado al `devicePixelRatio` para que no salga
  pixelado.
- Dos modos con pestañas: **Dibujar** (por defecto en pantallas táctiles) y
  **Escribir mi nombre** (por defecto en computador): el nombre se pinta con una
  fuente manuscrita y se exporta también como imagen. Los dos modos producen un
  PNG con fondo transparente, **recortado** al trazo, tope 150 KB.
- Validación: mínimo de puntos/longitud de trazo (un punto no es una firma); el
  botón "Firmar" se habilita solo con firma + casilla "He leído y apruebo".
- Botón "Borrar y repetir".
- Accesibilidad mínima: el texto se muestra completo en un cuadro con scroll y
  también se puede abrir en grande.

**Lo que viaja al servidor:** PNG en base64, método (`dibujada`/`escrita`),
identificación (si no viene de la sesión), casilla, EPS (el texto tiene un
espacio "está afiliado a la EPS ____"), RH del menor.

**Lo que el servidor guarda como evidencia (`consentimiento_firma`):** ver §4.9.
Hora = `now()` de Postgres; IP tomada de `x-forwarded-for` (primer valor) —
se guarda **completa** en la tabla de firmas (evidencia, acceso restringido) y
**solo su hash** en solicitudes/rate-limit; `user-agent`; versión del texto y su
hash; huella SHA-256 del PDF final.

### 4.7 · El PDF (R6)

- Librería: **`@react-pdf/renderer`** en el runtime Node (server action).
  Se escoge porque el documento es texto largo con párrafos: maneja el ajuste de
  líneas, estilos, imágenes y fuentes embebidas. Respaldo si diera problemas de
  empaquetado en Next 16: `pdf-lib` (más liviano, pero el ajuste de líneas es a
  mano). **Antes de instalar: verificar con la documentación actual (Context7)
  y con `node_modules/next/dist/docs/` si hace falta `serverExternalPackages`.**
- Fuentes: arrancar con las estándar (Helvetica cubre tildes y ñ). Montserrat /
  Open Sans embebidas solo si Laura quiere la marca en el PDF (archivos `.ttf`
  OFL en `src/lib/pdf/fonts/`; hoy `design-system/fonts/` solo tiene un README).
- **Página 1:** logo (`public/logo-cdaf.png`), título "CONSENTIMIENTO
  INFORMADO, TRATAMIENTO Y USO DE DATOS Y EXONERACIÓN DE RESPONSABILIDAD EN LAS
  ACTIVIDADES DEPORTIVAS – CENTRO DEPORTIVO ALEJANDRO FALLA", el texto de la
  versión vigente con la EPS insertada, y el bloque de datos: nombre del menor,
  documento (registro civil / TI), RH, nombre del representante legal, cédula,
  parentesco, **imagen de la firma**, "Firmado electrónicamente el 3 de octubre
  de 2026 a las 4:12 p. m. (hora de Colombia)".
- **Página 2 · "Registro de firma electrónica":** identificador de la firma,
  versión del texto y su hash, método (dibujada/escrita), fecha-hora del
  servidor (UTC y Bogotá), IP, navegador, y la frase "La integridad de este
  archivo se verifica contra la huella SHA-256 registrada en la plataforma".
  (La huella del archivo no puede ir dentro del archivo; se guarda en la base y
  se muestra en la ficha.)
- Nombre: `consentimiento-<apellido>-<nombre>-<aaaa-mm-dd>.pdf`. Tamaño
  esperado: 80–300 KB.
- Fechas en el PDF se formatean en el servidor con `timeZone: "America/Bogota"`
  (no hay hidratación de por medio, así que aquí sí se puede usar `Intl`).

### 4.8 · Dónde queda el PDF y cómo se ve en la ficha (R7, R9)

- Bucket privado nuevo **`consentimientos`** (evidencia). Ruta:
  `<firma_uuid>/consentimiento.pdf` y `<firma_uuid>/firma.png`. Políticas:
  `select` para SA / coord. admin / coord. deportivo / recepción / gestión de
  eventos (los mismos que hoy ven `cliente-docs`); **sin `insert/update/delete`
  para nadie con sesión**. Solo el servidor (service_role) escribe, una vez.
- La fila en **`cliente_documentos`** se crea con `tipo = 'consentimiento'`,
  `origen = 'firma_digital'`, `bucket = 'consentimientos'`, `miembro_id` del
  niño, `uploaded_by = null`. Así aparece en la tarjeta "Documentos" que ya
  existe, y **una ficha con dos hermanos muestra dos PDF, cada uno con el nombre
  de su niño** (R9).
- La ficha estrena una tarjeta **"Consentimientos"**: una línea por miembro
  activo con "Firmado el … por … (parentesco) · ver PDF" o **"Sin
  consentimiento"** en ámbar. La fuente de verdad del estado es
  `consentimiento_firma` (no `cliente_documentos`), para que el estado no
  dependa de un archivo.
- Enlaces al PDF: URL firmada de 1 hora, como hoy con `cliente-docs`.
- Si la firma quedó **`pendiente_asignar`** (D3), no hay `cliente_id` todavía:
  el PDF ya existe en el bucket; la bandeja la asigna y en ese momento se crea la
  fila de `cliente_documentos`.

### 4.9 · Modelo de datos (migraciones de la Fase 1)

> ⚠️ Antes de nombrar cada archivo: `ls supabase/migrations/ | tail -3`. La
> última hoy es `20260925111000_siigo_catalogo_sin_duplicados.sql`. Un valor de
> enum nuevo va **solo** en su propia migración si se usa en la misma tanda.

**Tablas nuevas** (todas: `revoke all from anon, authenticated` primero, RLS
activa, políticas explícitas después):

```sql
-- Texto del consentimiento, versionado. Sin fila vigente, la página pública muestra "En preparación".
consentimiento_version (
  id, codigo text unique ('2026-10'), titulo, texto text, texto_sha256 text,
  vigente_desde date, vigente_hasta date null, creado_por uuid, created_at
)   -- lectura: SA/CA; escritura: solo por migración (como servicios) o RPC solo-SA

-- Un envío del formulario público, tal cual llegó.
registro_solicitud (
  id uuid pk, sesion_id uuid, tipo registro_tipo ('datos'|'consentimiento'),
  estado registro_estado ('recibida'|'aplicada'|'en_revision'|'rechazada'|'expirada'),
  payload jsonb,            -- PII: se purga a los 90 días una vez aplicada (cron)
  resultado jsonb,          -- {creada, cliente_id, miembro_id, llenados[], candidatos[]}
  cliente_id, miembro_id,   -- a qué quedó atada (null si ambigua)
  ip_hash text, user_agent text,
  revisada_por uuid, revisada_el, nota_revision text,
  created_at, expira_el
)   -- select/update: PUEDE_REVISAR_REGISTROS (SA, CA); insert: solo RPC

-- SOLO facturación (D1): un NIT/razón social/correo de facturación distinto al que había.
registro_cambio (
  id, solicitud_id, cliente_id, miembro_id null, tabla text, campo text,
  valor_actual text, valor_nuevo text,
  estado cambio_estado ('pendiente'|'aprobado'|'rechazado'),
  decidido_por uuid, decidido_el, created_at
)

-- La evidencia de cada firma. Se conserva siempre.
consentimiento_firma (
  id uuid pk, solicitud_id, sesion_id,
  version_id → consentimiento_version,
  cliente_id null, miembro_id null,             -- null = pendiente_asignar
  estado firma_estado ('asignada'|'pendiente_asignar'|'anulada'),
  firmante_nombre, firmante_documento, firmante_parentesco, firmante_celular, firmante_email,
  menor_nombre, menor_documento, menor_rh, eps,  -- lo que se ESCRIBIÓ al firmar (evidencia)
  metodo firma_metodo ('dibujada'|'escrita'),
  firmado_el timestamptz default now(),          -- hora del servidor
  ip inet, user_agent text,
  firma_png_path text, pdf_path text, pdf_sha256 text,
  documento_id → cliente_documentos on delete set null,
  anulada_por uuid, anulada_el, motivo_anulacion text,
  created_at
)   -- select: mismos roles que ven documentos; update: solo RPC de asignar/anular

-- Hilvana el recorrido (cookie → fila).
registro_sesion ( id uuid pk, firmante jsonb, miembros jsonb, estado, created_at, expira_el )

-- Rate limit.
registro_intento ( id, ip_hash text, created_at )  -- índice (ip_hash, created_at); se purga en el cron
```

**Cambios a tablas existentes:**

```sql
-- Ficha unificada (D2)
create table cliente_acudientes (
  cliente_id → clientes, acudiente_id → acudientes, rol acudiente_rol ('padre'|'madre'|'otro'),
  principal boolean default false, created_at, primary key (cliente_id, acudiente_id)
);  -- índice único parcial: un solo principal por ficha
alter table clientes add column direccion text;
alter table cliente_miembros add column lugar_nacimiento text;
alter table clientes add column lugar_nacimiento text;   -- espejo del titular (trigger 0066 lo copia)
-- backfill: cada clientes.acudiente_id → fila principal con rol 'otro'

alter table cliente_documentos
  add column miembro_id bigint references cliente_miembros(id) on delete set null,
  add column bucket text not null default 'cliente-docs',
  add column origen documento_origen not null default 'subido';   -- 'subido' | 'firma_digital'
-- Trigger: un documento con origen 'firma_digital' no se puede borrar por DELETE (solo anular la firma).
```

`uploaded_by` ya admite null (FK `on delete set null`), así que un documento
creado por el sistema cabe sin tocar la columna. Las políticas de
`cliente_documentos` no cambian: el servidor escribe con service_role.

**Funciones (todas `security definer`, `set search_path = ''`, y `revoke all
from public, anon, authenticated` salvo donde se indique):**

| Función | Quién la llama | Qué hace |
|---|---|---|
| `registro_permitido(p_ip_hash) → bool` | servidor | Cuenta intentos en 10 min y en 24 h; inserta el intento. Topes iniciales: 10 / 10 min · 40 / día |
| `registro_solicitud_crear(p_tipo, p_payload, p_ip_hash, p_ua, p_sesion) → uuid` | servidor | Inserta la solicitud `recibida` |
| `registro_aplicar_datos(p_solicitud, p_decision jsonb) → jsonb` | servidor | §4.5. `p_decision` viene del matching: `{modo, cliente_id, miembro_id, candidatos}` |
| `consentimiento_firmar(p_solicitud, p_datos jsonb) → uuid` | servidor | Crea la fila de firma con `firmado_el = now()`; estado según tenga o no `miembro_id` |
| `consentimiento_adjuntar(p_firma, p_pdf_path, p_png_path, p_sha256) → bigint` | servidor | Guarda rutas y huella; si está asignada, crea `cliente_documentos` y devuelve su id |
| `registro_revisar(p_solicitud, p_accion, p_cliente, p_miembro, p_nota)` | bandeja (con sesión) | Valida `private.user_role()` en los roles de edición de clientes; asigna una solicitud/firma ambigua o la rechaza; audita |
| `registro_cambio_decidir(p_cambio, p_aprobar)` | bandeja | Aplica un cambio aprobado al campo indicado (con `case` cerrado por campo permitido) o lo rechaza; audita con `before/after`. **Si el campo es `factura_a_nit`, no toca facturas**: la server action llama después a la lógica existente de reatribución |
| `consentimiento_anular(p_firma, p_motivo)` | solo SA | Estado `anulada` con motivo; el archivo no se toca |
| `private.nota_sistema_roles(p_texto, p_roles app_role[])` | otras funciones | Generaliza `private.nota_sistema_superadmins` (existente): nota "Aviso automático" a los roles indicados |
| `registro_limpiar()` | pg_cron diario | Expira sesiones y solicitudes `recibida` > 48 h; purga `payload` de solicitudes aplicadas > 90 días; borra `registro_intento` > 2 días. **Nunca toca `consentimiento_firma` ni los archivos** |

Para `registro_revisar` y `registro_cambio_decidir` se pueden dejar como
`security invoker` + políticas si resulta más simple; la decisión se toma al
escribirlas, con la regla de `handoff.md` §1.14: nada de `update` directo sobre
`siigo_facturas`.

**Cron:** un `cron.schedule` para `registro_limpiar()` a las 07:50 UTC (02:50
Bogotá), junto a los cuatro existentes. Va en su propio script
(`scripts/schedule-registro-cron.mjs`) como los demás, porque las migraciones
no llevan secretos.

### 4.10 · Bandeja de revisión (Fase 3)

Ruta `/clientes/registros`. Guardia: **`PUEDE_REVISAR_REGISTROS = ["superadmin",
"coord_admin"]`** (D8) en `src/lib/registro/revision.ts`, usada en la página
**y** en cada acción (handoff §1.12), y la misma lista en las políticas de la
base. Es una regla de dentro del módulo de clientes, como `PUEDE_REABRIR_EVENTO`.

Una sola pantalla, pequeña (D1 y D3 la dejaron chica):

1. **Facturación por aprobar** — filas de `registro_cambio` (solo campos de
   facturación) agrupadas por ficha: valor actual · valor nuevo · *Aprobar* /
   *Rechazar*. Aprobar avisa: "Esto atará las facturas libres de ese NIT a esta
   ficha".
2. **Por asignar** — solo si existe alguna (caso extremo de D3): la firma o la
   solicitud ambigua con sus candidatos y un botón *Asignar a…* (buscador
   `miembro-autocomplete` existente) o *Descartar* (con motivo). Si no hay
   ninguna, la sección no se pinta.
3. **Historial** — últimas 200 solicitudes con su estado, qué se sobrescribió
   (del `audit_log`) y quién decidió.

Avisos: al entrar algo a aprobar o asignar se deja **una** nota automática a
SA + coord. admin (`private.nota_sistema_roles`). Sin nota para lo que se aplicó
solo. La entrada del menú lleva el contador de pendientes.

Todo lo que se decide en la bandeja queda en `audit_log` con `before/after`.

### 4.11 · Seguridad, privacidad y abuso

| Riesgo | Mitigación |
|---|---|
| Consultar datos ajenos escribiendo una cédula | La página **no devuelve datos existentes** nunca; el mensaje final es el mismo exista o no la persona |
| Cambiar datos ajenos (correo, celular, NIT) | D1: se acepta el riesgo para datos de contacto (queda `before` en auditoría y recepción lo puede revertir); el **NIT nunca se aplica solo** — va a revisión |
| Crear fichas basura en masa | Honeypot + `registro_permitido` (10 / 10 min, 40 / día por IP) + tamaños máximos + `estado` visible en la bandeja para descartar en lote (SA) |
| Robots más elaborados | Fase 5.4: Cloudflare Turnstile (gratis) si se observa abuso. No se pone de entrada para no estorbar a los papás |
| Firma repudiada ("yo no firmé") | Evidencia §4.9 + hoja 2 del PDF + huella SHA-256 + bucket de solo escritura |
| PDF alterado después | Huella en la base; la ficha muestra "Integridad: verificada" al comparar |
| Borrado accidental de evidencia | Sin política de delete en el bucket; trigger que impide `delete` en `cliente_documentos` de origen `firma_digital`; anular = estado + motivo |
| Filtración por logs | `evidencia.ts` no imprime PII; los `console.error` del camino público llevan solo ids |
| Sesión del recorrido robada | Cookie `httpOnly`/`secure`, 2 h, solo `/registro`; nada en la URL |
| Ley 1581 (datos de menores, salud: EPS/RH) | Casilla D9 en el formulario; texto del consentimiento cubre el tratamiento; retención: `payload` de solicitudes se purga a los 90 días; firmas se conservan (finalidad legal) |
| Tamaño de la server action | PNG ≤ 150 KB, muy por debajo del tope de 12 MB de `next.config.ts` |
| Caída del PDF a mitad de camino | Orden: firma en base → archivos → `consentimiento_adjuntar`. Si falla el PDF, la firma queda `pendiente_asignar`-sin-pdf con bandera `pdf_path null`; un reintento en la bandeja lo regenera desde la evidencia (la firma PNG se sube primero) |

### 4.12 · Rendimiento y operación

- Todo corre en el runtime **Node** de Vercel (el PDF lo exige). Generar el PDF
  toma ~0,5–2 s; aceptable para un botón "Firmar".
- Volumen esperado: ~150–250 firmas en el arranque y unas pocas por semana
  después. Ni el bucket ni las tablas necesitan nada especial.
- Sin costo adicional para el club: Supabase Pro y Vercel Pro ya cubren esto.
- Monitoreo mínimo: la bandeja + el `audit_log` + una consulta SQL guardada
  "solicitudes por día y estado" (documentada en MEMORIA al terminar).

---

## 5 · Plan de fases

Cada fase tiene: objetivo, entregables, migraciones, pruebas, verificación,
criterio de "hecho" y estimación. **Se ejecuta una a la vez y se revisa en
local antes de pasar a la siguiente.** Al cerrar cada fase: `npm run build`,
luego `npm test` (nunca a la vez), commit en `main` con mensaje en español, y
push (= producción). Lo que aún no tenga texto vigente no se ve desde fuera
(§5.2, la puerta natural).

### Fase 0 · Decisiones y textos — ✅ CERRADA el 1-oct-2026

Respuestas en §2. Insumos en `Consentimiento informado/insumos/`. Texto de la
casilla D9 propuesto en §4.4, pendiente del visto bueno de Laura (se puede dar
al revisar la pantalla en la Fase 3).

### Fase 1 · Cimientos (base de datos y librerías) — ✅ HECHA el 1-oct-2026 (detalle en MEMORIA.md, sección "Registro por QR")

**Objetivo:** que exista todo lo que las pantallas van a usar, verificado, sin
exponer nada todavía. Incluye la **unificación de la ficha** (D2), que es un
cambio visible para el personal: la ficha y su formulario muestran padre, madre,
dirección y lugar de nacimiento.

Entregables:
1. Migraciones de §4.9 (enums en su propia migración cuando se usen en la
   misma tanda), en este orden sugerido:
   - `…_ficha_unificada.sql` — `cliente_acudientes` (ficha ↔ acudiente, `rol`,
     `principal`), `clientes.direccion`, `cliente_miembros.lugar_nacimiento` (+
     espejo del titular en el trigger de 0066); backfill de las 129 fichas con
     `acudiente_id` como fila `principal`; políticas iguales a `acudientes`
   - `…_registro_enums.sql`
   - `…_consentimiento_version.sql` (+ semilla del texto del Word, versión
     `2026-10`, con `vigente_desde` **null** → la página pública sigue "En
     preparación")
   - `…_registro_tablas.sql` (sesión, solicitud, cambio, intento, firma)
   - `…_cliente_documentos_miembro_bucket_origen.sql` (+ trigger anti-borrado)
   - `…_bucket_consentimientos.sql` (bucket + políticas de solo lectura)
   - `…_registro_funciones.sql` (RPC de §4.9 + `nota_sistema_roles`)
   - `…_registro_limpiar.sql` (función; el cron va por script)
2. `database.types.ts` actualizado a mano.
3. **Ficha del personal con los campos nuevos**: `cliente-form.tsx` (bloques
   padre / madre, dirección, lugar de nacimiento), `createCliente`/`updateCliente`
   (escriben `cliente_acudientes` y mantienen `acudiente_id` = el principal),
   `[id]/page.tsx` (lista los acudientes), `hermanos.tsx` (lugar de nacimiento).
   Pruebas de render existentes ampliadas (`clientes-form.test.tsx`).
4. `src/lib/audit.ts` → `logAuditSistema()`.
5. Dependencias instaladas y verificadas con su documentación actual:
   `signature_pad`, `@react-pdf/renderer` (o `pdf-lib`), `qrcode` (dev).
6. `scripts/schedule-registro-cron.mjs`.

Pruebas (§7): `tests/registro-rls.test.ts`, `tests/registro-aplicar.test.ts`,
`tests/clientes-form.test.tsx` ampliado.

Verificación por API (no confiar en el "ok" de `db:apply`):
`to_regclass` de cada tabla · `pg_policies` (columnas `qual` **y** `with_check`)
· `has_table_privilege('anon', …)` = false en todas · `storage.buckets` tiene
`consentimientos` privado · `cron.job` tiene la tarea.

**Hecho cuando:** las pruebas de RLS y del RPC pasan contra la base real, la
verificación por API cuadra, y `npm run build` sigue en verde.
**Estimación:** 18–24 h (incluye la ficha unificada).

### Fase 2 · Consentimiento público (camino R10 completo) — ✅ HECHA el 1-oct-2026 (detalle en MEMORIA.md)

**Objetivo:** un papá escanea, elige *Consentimiento informado*, se identifica,
firma, y el PDF aparece en la ficha del niño. Es la parte de más valor y la de
menos riesgo (no modifica datos existentes).

Entregables:
1. `src/app/registro/layout.tsx`, `page.tsx` (landing con los dos botones; el de
   datos lleva a una pantalla "Muy pronto" hasta la Fase 3), `cerrado/`.
2. `consentimiento/page.tsx` + `firma-pad.tsx` + `actions.ts`:
   identificación (menor + firmante, o "firmo por mí mismo"), texto vigente,
   casilla, firma, `firmarConsentimiento()`.
3. `src/lib/registro/match.ts` (búsqueda §4.5), `sesion.ts`, `evidencia.ts`,
   `limites.ts`, `esquemas.ts`.
4. `src/lib/pdf/consentimiento-pdf.tsx` (§4.7).
5. Ficha: tarjeta **"Consentimientos"** por miembro + documentos con nombre del
   miembro y bucket correcto; `deleteDocumento` rechaza origen `firma_digital`.
6. Middleware: `/registro` público.
7. Bandeja **mínima**: `/clientes/registros` solo con "Por asignar" para las
   firmas `pendiente_asignar` (D3). Lo demás en Fase 3.
8. Página `listo/` con "Volver al inicio" (sin cadena de hermanos todavía; se
   puede firmar por otro hijo repitiendo el camino).

Pruebas: `registro-match.test.ts` (lógica pura, casos reales: hermanos con el
mismo documento, "SIMON VÉLEZ"/"Simon Velez", Karent con una letra de
diferencia en el correo), `registro-consentimiento.test.ts` (Postgres:
firmar → adjuntar → fila en `cliente_documentos` con `miembro_id`; anular no
borra; revertido), `registro-pdf.test.ts` (genera un PDF, verifica tamaño,
huella estable y que contiene el nombre), `registro-render.test.tsx` (landing,
consentimiento, cerrado, listo, ficha con la tarjeta nueva).

Verificación manual en local (con la versión del texto puesta en vigente
**solo en local** o con un `?preview` que exija sesión de SA): firmar desde
iPhone y Android por Safari/Chrome (dedo), desde Mac (mouse y "escribir mi
nombre"), abrir el PDF, ver la ficha, intentar borrar el documento.

**Hecho cuando:** tres firmas de prueba (niño existente, adulto por sí mismo,
niño no encontrado → pendiente y asignado desde la bandeja) terminan con su PDF
en la ficha correcta, con evidencia completa, y las pruebas pasan.
**Estimación:** 22–30 h.

### Fase 3 · Formulario de datos, aplicación y bandeja completa (R2–R4, R8–R9)

**Objetivo:** el camino largo entero, con la cadena de hermanos.

Entregables:
1. `datos/page.tsx` + `actions.ts` (`enviarDatos()`), formulario §4.4 con el
   interruptor D4 y la casilla D9.
2. `src/lib/registro/aplicar.ts` → `registro_aplicar_datos` (§4.5).
3. Redirección a `consentimiento/` con el niño ya identificado desde la sesión
   (R4) — la identificación se muestra como resumen no editable.
4. `listo/`: "¿Registrar otro hijo?" → `datos/` con el firmante precargado
   desde la sesión (R9).
5. Bandeja completa: pestañas "Cambios por aprobar" e "Historial";
   `registro_cambio_decidir`; al aprobar NIT, la acción corre la reatribución
   existente; notas automáticas a los revisores; contador en el menú.
6. Ficha: en "Datos" un aviso discreto "Hay N cambios propuestos por la familia,
   revisar" cuando existan pendientes para esa ficha.

Pruebas: `registro-aplicar.test.ts` ampliado (crear ficha nueva con acudiente;
hermano en ficha existente; sobrescritura con `before` en auditoría; NIT distinto → pendiente;
NIT que choca → pendiente y **0** facturas movidas; ambiguo → `en_revision` y 0
escrituras en `clientes`; todo revertido), `registro-bandeja.test.tsx` (render
con datos sembrados y borrados en `finally`, como `horas-render`),
`registro-render.test.tsx` ampliado (datos, listo con cadena).

Verificación manual: recorrido completo con dos hijos desde un celular; revisar
en la bandeja un cambio de celular y un cambio de NIT; comprobar en Siigo que
las facturas se atan solo tras aprobar.

**Hecho cuando:** el recorrido de dos hermanos deja dos PDF en la misma ficha,
los cambios aparecen en la bandeja y nada se aplicó sin aprobación.
**Estimación:** 24–32 h (bandeja más pequeña).

### Fase 4 · QR, salida a producción y documentación

1. `scripts/qr-registro.mjs` → `generated/qr-registro.svg` y `.png` (1200 px)
   con `https://alejandrofallacd.com/registro`. Diseño de la pieza impresa
   (afiche/mesa de recepción) queda del lado de Laura; el script entrega el QR
   limpio y una versión con el logo en el centro.
2. Poner **vigente** la versión del texto (migración pequeña o RPC solo-SA):
   esto "abre" la página pública.
3. Prueba de humo en producción: escanear el QR impreso, firmar un caso de
   prueba real (Laura), verlo en la ficha, anularlo con motivo.
4. Plan de arranque con el club: en qué día se pone el QR, quién revisa la
   bandeja, qué se le dice a un papá que "no se encontró".
5. Documentación: sección nueva en `MEMORIA.md` (decisiones, trampas
   encontradas, consultas de monitoreo), ajuste de `handoff.md` (§4 estructura:
   `registro/`; §6 tablas; §13 buckets + cron; §14 reglas de negocio nuevas:
   "la página pública sobrescribe todo salvo facturación"; "la evidencia no se borra"), y anotar
   en MEMORIA que ahora son **seis** los sitios que crean fichas.
6. Revisar `DESPLIEGUE.md`: no hay variables nuevas en Vercel (todo usa las 9
   existentes); si se activa el correo (5.3), ahí sí entran las de Resend.

**Hecho cuando:** el QR impreso funciona en producción con un caso real y la
documentación está actualizada.
**Estimación:** 6–10 h.

### Fase 5 · Opcionales (cada una es una decisión aparte)

| # | Qué | Depende de | Estimación |
|---|---|---|---|
| 5.1 | ~~Padre y madre por separado~~ — **pasó a la Fase 1** por D2 | — | — |
| 5.2 | **Lista "sin consentimiento"** en `/clientes` (filtro) y en la ficha de cada academia ("N niños sin firmar"), para que el club persiga a los que faltan | Fase 2 | 4–6 h |
| 5.3 | **Copia del PDF al correo** del firmante con Resend (plantilla con marca como `clase-confirmada.ts`) | D5 + cuenta Resend del club | 3–4 h |
| 5.4 | **Cloudflare Turnstile** si aparecen envíos basura | abuso observado | 2–3 h |
| 5.5 | **Código de verificación** por correo antes de firmar (nivel 2 de D7) | D7 + Resend | 6–8 h |
| 5.6 | **Renovación**: `vigente_hasta` en firmas, aviso "consentimiento vencido" y re-firma anual/semestral | D6 | 4–6 h |
| 5.7 | **"Firmar desde mi celular"** en computador: QR en pantalla que abre la misma sesión en el teléfono | Fase 2 | 4–6 h |
| 5.8 | **Certificado del club** para sellar cada PDF (nivel 3 de D7) | decisión + compra del certificado | 8–12 h |

---

## 6 · Lista de chequeo por fase (la de `handoff.md`, aplicada aquí)

Antes de escribir código de la fase:
- [ ] Releer la sección de `MEMORIA.md` de clientes/documentos.
- [ ] Leer en `node_modules/next/dist/docs/` lo que se vaya a usar: server
      actions, `cookies()`/`headers()` (son asíncronos), `redirect`, runtime
      Node, `serverExternalPackages`, `refresh()` de `next/cache`.
- [ ] Documentación actual (Context7) de `signature_pad`, `@react-pdf/renderer`,
      `qrcode`.
- [ ] `ls supabase/migrations/ | tail -3` antes de nombrar cada migración.

Antes de cerrar la fase:
- [ ] `npm run build` en verde → **después** `npm test` en verde.
- [ ] Migraciones aplicadas con `npm run db:apply` **y verificadas por API**
      (`to_regclass`, `pg_policies` con `qual` y `with_check`,
      `has_table_privilege('anon', …)`).
- [ ] `database.types.ts` al día.
- [ ] Barrido de guardias: los tres `grep` de `handoff.md` §7.2 (la bandeja
      deriva de `rolesForModule`).
- [ ] Cada pantalla nueva tiene su render en `tests/*-render.test.tsx`.
- [ ] Ningún `console.log` con datos personales en el camino público.
- [ ] Commit en español con la firma que corresponda, push, y `curl … /login` = 200.

---

## 7 · Pruebas (resumen)

| Archivo | Tipo | Qué fija |
|---|---|---|
| `tests/registro-rls.test.ts` | Postgres, revertido | `anon` no lee ni escribe ninguna tabla nueva; un `authenticated` sin rol tampoco; recepción lee solicitudes y firmas; nadie borra en `consentimientos`; el trigger impide `delete` de un documento `firma_digital` |
| `tests/registro-match.test.ts` | Lógica pura | Los casos reales de §4.5: documento compartido por hermanos, nombre con tildes/mayúsculas, correo con una letra distinta + cédula correcta, adulto que es acudiente de otra ficha, ambigüedad |
| `tests/registro-aplicar.test.ts` | Postgres, revertido | Ficha nueva con uno y dos acudientes y titular por trigger; hermano nuevo; sobrescritura con `before`; NIT distinto → pendiente; NIT en uso → pendiente y 0 facturas tocadas; ambiguo → 0 escrituras; auditoría con `actor_id null` |
| `tests/registro-consentimiento.test.ts` | Postgres, revertido | Firmar → adjuntar → `cliente_documentos` con `miembro_id`, `bucket`, `origen`; `pendiente_asignar` → asignar; anular conserva archivo y cambia estado; dos hijos → dos filas |
| `tests/registro-pdf.test.ts` | Lógica | Genera el PDF con datos de prueba: tamaño razonable, huella reproducible con la misma entrada, contiene nombre y fecha |
| `tests/registro-render.test.tsx` | Render | Landing, datos, consentimiento (con y sin sesión), listo, cerrado, ficha con tarjeta de consentimientos, bandeja. `FirmaPad` se monta suelto (es cliente; el estado inicial sí llega al HTML) |
| `tests/registro-limites.test.ts` | Postgres, revertido | `registro_permitido`: el 11º intento en 10 min se rechaza; el honeypot no crea nada |

Reglas heredadas: `SAVEPOINT` en pruebas de rechazo; personas y documentos de
prueba **inventados** (documento `9990000xxx`, correo `prueba+registro@…`) y
borrados en `finally`; nada que dependa de una ficha real que el club pueda mover.

---

## 8 · Riesgos y cómo se vigilan

| Riesgo | Señal | Respuesta |
|---|---|---|
| Duplicados nuevos por matching fallido | Bandeja "Por asignar" crece; `clientes` sube más de lo esperado | Endurecer reglas de §4.5 con los casos reales; nunca relajar a "crear siempre" |
| Papás que no encuentran cómo firmar en computador | Quejas en recepción | Fase 5.7 (QR en pantalla) |
| PDF falla en Vercel por empaquetado de la librería | Error en el primer despliegue | Respaldo `pdf-lib` previsto; la firma ya está guardada y se regenera |
| Recepción no revisa la bandeja | Pendientes con más de 7 días | Nota automática semanal con el conteo (variante de `registro_limpiar`) |
| Texto cambia después de firmas | Nueva versión | Versionado: los PDF viejos siguen válidos con su versión; 5.6 si hay que re-firmar |
| Abuso del formulario | Muchas solicitudes rechazadas / basura | Turnstile (5.4) y bajar los topes de `registro_permitido` |
| El club quiere ver "quién falta por firmar" desde el día 1 | Pregunta del club | 5.2 es pequeña; se puede adelantar a la Fase 3 |

---

## 9 · Fuera de alcance (a propósito)

- Firma digital certificada por cada papá (D7 nivel 4).
- Cambiar el estado de la ficha, paquetes o matrículas desde la página pública.
- Pagos, paquetes, inscripciones a academias desde la página pública.
- Portal del cliente con clave (esto es un formulario, no una cuenta).
- Reemplazar el formulario de `/clientes/nuevo` del personal (sigue igual).

---

## 10 · Glosario del plan

| Término | Significado aquí |
|---|---|
| **Solicitud** | Un envío del formulario público, guardado tal cual llegó |
| **Aplicar** | Convertir una solicitud en escrituras sobre la ficha (crear / sobrescribir) |
| **Cambio pendiente** | Un dato que ya existía y llegó distinto; espera aprobación en la bandeja |
| **Firma** | La fila de evidencia de un consentimiento firmado (quién, cuándo, cómo, qué texto) |
| **Pendiente de asignar** | Firma válida cuyo niño no se pudo identificar con certeza |
| **Versión del texto** | El consentimiento tal como estaba escrito cuando se firmó |
| **Evidencia** | PDF + PNG de la firma en el bucket `consentimientos` + fila de firma |
| **Sesión del recorrido** | La cookie que une datos → consentimiento → otro hijo |
| **Bandeja** | `/clientes/registros`: donde recepción asigna, aprueba o rechaza |

---

*Cuando se apruebe, la ejecución arranca por la Fase 1 y este documento se va
marcando fase por fase. Lo aprendido en el camino va a `MEMORIA.md`; las reglas
que habrían evitado un daño, a `handoff.md`.*
