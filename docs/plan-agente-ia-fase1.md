# Plan · Agente IA, Fase 1

> Estado: **aprobado y publicado el 24-nov-2026.** Pasos 1 a 4 hechos ese día, más la mascota "Agente
> CDAF" que Laura pidió después (el chat flotante en todas las pantallas). Queda medir el mes de prueba.
> La Fase 1 es el salto de "responde sobre 12 cifras fijas" a "consulta toda la plataforma y
> conversa". Las fases 2 a 4 (EasyCancha con historia, gastos de Siigo, informes y alertas) van
> después y no están en este plan.

## Decisiones ya tomadas por Laura (24-nov-2026)

- El agente verá también **gastos y compras de Siigo** (se construye en la Fase 2).
- El agente **puede ver datos delicados**: salarios, datos de niños y acudientes.
- Lo usa solo el rol **superadministrador**.
- **Dos modelos de OpenAI**, con la llave que ya tiene el proyecto (comprobado: la llave tiene
  acceso a los dos): `gpt-6.2-astra` para lo que exige razonar (preguntas de negocio, propuestas,
  informes) y `gpt-6-luna` para lo que solo es consultar información.
- El reparto entre los dos es **invisible**: sin etiqueta de qué modelo respondió y sin botón para
  repetir la respuesta. Si hay duda de qué tipo de pregunta es, va a `gpt-6.2-astra`.
- El agente es de **solo lectura**.
- **Cada superadministrador ve solo sus conversaciones guardadas.**
- **Sin tope de gasto en OpenAI durante el primer mes de prueba.** Al cerrar ese mes se revisa el
  gasto real. (El máximo de consultas encadenadas por pregunta se mantiene: es un freno técnico, no
  un tope de gasto.)

---

## Parte 1 · Qué va a cambiar

### Lo que se ve en `/agente`

- **Una conversación**, no una pregunta suelta: el agente recuerda lo que se le dijo antes
  ("¿y el mes pasado?", "ahora solo pádel").
- **La respuesta aparece mientras se escribe**, y mientras busca dice qué está haciendo
  ("Consultando la cartera…").
- **Conversaciones guardadas**: una lista para volver a una anterior, y "Nueva conversación".
- **Tablas dentro de la respuesta** cuando la pregunta lo pide.
- Debajo de cada respuesta, plegado, **"Cómo lo calculé"**: de dónde salió cada cifra y de qué
  fechas.
- Las preguntas sugeridas se cambian por unas que el agente nuevo sí puede responder.

### Lo que el agente va a poder responder

| Tema | Ejemplos | De dónde sale |
|---|---|---|
| Ingresos | Facturado, cobrado y pendiente de cualquier periodo; por servicio; por día; mejores clientes | Los mismos cálculos de `/dashboard` e `/ingresos` |
| Cartera | Quién debe, cuánto y hace cuánto; por servicio | Los de `/cartera` |
| Un cliente | Su ficha, su familia, sus paquetes, sus clases, sus facturas y su deuda | Ficha del cliente |
| Eventos | Ingreso, costo y utilidad de cada torneo; lo retenido en los abiertos | Los de `/eventos` |
| Academias | Niños por academia y por profesor, clases de la semana, asistencia, clases sin cerrar | El planeador y el cierre |
| Clases y paquetes | Clases por profesor, deporte y estado; paquetes activos, por vencer y agotados | `/clases` y `/paquetes` |
| Nómina de entrenadores | Cuánto se le paga a cada uno en una quincena y por qué | El cálculo de `/liquidacion` |
| Turnos y horas | Horas trabajadas, extras, nocturnas y festivas por persona | El de `/horas` |
| Cafetería | Pedidos por día, por producto y por forma de pago; ventas reales desde Siigo | `/cafeteria/pedidos` y Siigo |
| Personal | Quién trabaja, en qué rol, cómo se le paga | `/empleados` |
| Notas | Pendientes del tablón del staff | `/notas` |
| Ocupación de canchas | Qué franjas y días se llenan y cuáles quedan vacíos, en las últimas semanas | EasyCancha, en vivo |
| Productos | Qué se vende más y qué casi no rota, por unidades y por monto | Las líneas de las facturas de Siigo |
| Ticket | Cuánto gasta en promedio cada factura y cada cliente, y qué se compra junto | Las facturas de Siigo |

Además, para lo que nadie previó, el modelo grande puede hacer **consultas libres de solo lectura**
sobre la base ("niños que faltaron tres semanas seguidas").

### Lo que todavía NO hace en esta fase

- **Rentabilidad**: faltan los gastos de Siigo (Fase 2). Hoy solo conoce la nómina y los gastos de
  eventos.
- **Ocupación de muchos meses de un tirón**: se consulta en vivo a EasyCancha; la copia diaria
  que lo vuelve rápido es de la Fase 2.
- **Rentabilidad exacta por profesor**: lo de academia se factura por academia, no por profesor.
- **Gráficas e informes descargables** (Fase 3).
- **Informe semanal y alertas automáticas** (Fase 4).

### Cómo se cuida que no diga una cifra equivocada

1. **Las cifras de dinero las calcula la base, no el modelo.** El agente pide el dato a la misma
   función que usa la pantalla; él solo escoge cuál y redacta.
2. **El modelo pequeño no hace consultas libres.** Solo el grande.
3. **El agente conoce las reglas del club**: Siigo manda para el dinero; lo de hoy puede faltar
   porque Siigo carga con un día de rezago; un torneo se mide por contribución; qué es una venta de
   mostrador; qué es una ficha y qué es un miembro.
4. **Si no tiene el dato, lo dice.** No rellena.
5. **Banco de preguntas**: unas 20 preguntas reales cuya respuesta se verifica contra las pantallas
   antes de publicar. Se corre cada vez que se toque el agente.

### Seguridad

- **Solo lectura.** El agente no puede crear, cambiar ni borrar nada de la plataforma.
- **Solo superadministrador**, validado en la página y otra vez al recibir cada pregunta.
- **Queda fuera, aunque pueda ver lo delicado**: los PIN de turno, las contraseñas, las fotos de
  marcación y la evidencia técnica de las firmas (IP y navegador). No son datos de negocio.
- **Lo que se pregunta y lo que se consulta viaja a OpenAI.** Se le pide que no guarde las
  conversaciones de su lado.
- **Cada pregunta queda en la bitácora**, con qué consultó y cuánto costó.
- **Tope por pregunta**: un máximo de consultas encadenadas, para que una pregunta no se dispare
  en costo ni en tiempo.

### Cómo se construye: cuatro pasos, cada uno revisado antes del siguiente

| Paso | Qué se hace | Qué revisa Laura |
|---|---|---|
| 1. Base | Tablas para guardar conversaciones, la consulta de solo lectura y los resúmenes que faltan (clases, asistencia, cafetería, clientes) | Nada en pantalla todavía; informe de lo creado y verificado |
| 2. Motor | Las herramientas, el reparto entre los dos modelos y el manual del negocio. Se prueba por consola con el banco de preguntas | Las respuestas del banco de preguntas, comparadas con las pantallas |
| 3. Pantalla | El chat nuevo: conversación, respuesta en vivo, historial | La pantalla en local |
| 4. Afinar y publicar | Ajustes, medición del costo real, pruebas completas | Decide cuándo se publica |

- De paso se corrigen los dos fallos del agente de hoy (el mes calculado con el reloj del servidor
  y el conteo de clases que se corta en 1.000).
- **Nada llega a la página de producción hasta que Laura diga "publícalo".**
- ⚠️ El paso 1 sí toca la base real desde el principio, porque el proyecto tiene una sola base. Son
  solo **adiciones** (tablas y funciones nuevas); no se cambia ni se borra nada de lo que existe.

### Banco de preguntas (las de Laura, 24-nov-2026)

Son todas de análisis: van a `gpt-6.2-astra`. Tres de ellas pedían datos que el plan no traía, así
que la Fase 1 suma tres herramientas (ventas por producto, ticket y ocupación por franja).

| Pregunta | ¿Se responde en la Fase 1? | Con qué | Límite que el agente debe decir |
|---|---|---|---|
| ¿Por qué mis ingresos bajaron este mes? | Sí | Facturado por servicio y por día contra el mes anterior, mejores clientes, eventos | El mes en curso va incompleto y Siigo carga con un día de rezago: compara los mismos días |
| Ideas para aumentar las clases de pádel | Sí | Clases y paquetes de pádel por profesor y horario, clientes de pádel, ocupación por franja | — |
| ¿Qué dejar de vender en cafetería por poca rotación? | Sí | **Ventas por producto** de Siigo (unidades, monto y última venta) | Sin costos ni inventario: mide rotación, no margen |
| ¿Cómo aumentar el ticket por cliente? | Sí | **Ticket** promedio por factura y por cliente, y qué se compra junto | La venta de mostrador es anónima: ahí hay ticket por factura, no por cliente |
| ¿Cuáles son los servicios más exitosos? | Sí | Facturado por servicio y su tendencia | Éxito por ingreso, no por ganancia (faltan los gastos, Fase 2) |
| ¿Qué profesor me es más rentable? | En parte | Lo facturado por sus clases contra lo que se le paga (liquidación) | La academia se factura por academia, no por profesor; y no hay otros costos |
| ¿Qué horarios convienen para promociones? | Sí | **Ocupación por franja** y día, de las últimas semanas, desde EasyCancha | Se consulta en vivo: rangos largos tardan (la copia diaria es de la Fase 2) |

---

## Parte 2 · Detalle técnico (para quien construye)

Leer antes `handoff.md` completo. Lo de abajo respeta sus reglas; donde una regla decide el
diseño, se nombra.

### Arquitectura

```
/agente (page.tsx, servidor)  →  chat (cliente)
        │  POST /agente/chat  (route.ts, respuesta por partes con ReadableStream)
        ▼
  src/lib/agente/
    motor.ts          bucle: modelo → herramientas → modelo, hasta la respuesta final
    enrutador.ts      gpt-6-luna clasifica: "consulta" | "analisis" (duda → analisis)
    herramientas/     una por tema; cada una valida sus argumentos con zod
    manual.ts         el manual del negocio (instrucciones fijas)
    costo.ts          tokens → dólares, con la tabla de precios vigente
```

- **API de OpenAI**: Responses API con herramientas de tipo `function` y `strict: true`, bucle
  manual y `store: false` reenviando los ítems de salida (`toResponseInputItems`), según la guía
  vigente de *function calling*. Se agrega el SDK oficial `openai` (hoy `agent.ts` usa `fetch`
  contra `chat/completions` con `gpt-4o-mini`).
- **Por qué `route.ts` y no Server Action**: una acción devuelve la respuesta completa; aquí se
  necesita enviarla por partes. La guía de Next 16 (`route.md` → Streaming) lo hace con las Web
  APIs. `maxDuration` se declara en el `route.ts`; el valor se fija contra el límite del plan de
  Vercel al construir (hoy la página tiene 60).
- **El guardia va en los dos sitios** (handoff §1.12): `requireRole(rolesForModule("agente_ia"))`
  en `page.tsx` y en `route.ts`.
- **Con qué sesión corren las herramientas**: la del superadministrador (`createClient()`), para que
  la RLS siga siendo el último candado. Excepciones puntuales con `createAdminClient()` solo donde
  ya es el patrón del proyecto.
- **"Hoy" sale de `hoyBogota()`** (`src/lib/periodo.ts`). La fecha va en el turno del usuario, no en
  las instrucciones fijas, para no romper el caché del prompt.

### Reparto entre modelos

| | `gpt-6-luna` | `gpt-6.2-astra` |
|---|---|---|
| Cuándo | El enrutador dijo "consulta" | "analisis", o duda |
| Herramientas | Solo las oficiales | Oficiales + `consulta_libre` |
| Esfuerzo de razonamiento | bajo | medio (se ajusta con el banco de preguntas) |

El enrutador es una llamada corta a `gpt-6-luna` con salida estructurada. Los informes automáticos
de la Fase 4 irán siempre con `gpt-6.2-astra`.

### Herramientas oficiales → qué reutilizan

| Herramienta | Reutiliza (ya existe) | Falta construir |
|---|---|---|
| `ingresos` | `siigo_recaudo`, `siigo_facturado_servicio`, `siigo_ingreso_servicio`, `siigo_facturado_diario`, `siigo_ingreso_diario`, `siigo_top_clientes` | — |
| `cartera` | `siigo_cartera`, `siigo_cartera_antiguedad` | — |
| `cliente` | `siigo_resumen_cliente`, `siigo_facturas_cliente_servicio`, `miembro_clases_academia` | Buscador por nombre o documento y resumen de la ficha |
| `eventos` | `eventos_pyg`, `eventos_resultado_periodo`, `eventos_retenido` | — |
| `academias` | `planeador_semana`, `academia_matricula`, `clase_semanal_roster`, `academia_pendientes` | Resumen de asistencia por periodo |
| `clases` | — | Resumen por periodo, profesor, deporte, tipo y estado (RPC) |
| `paquetes` | — | Resumen: activos, por vencer, agotados (RPC) |
| `liquidacion` | `calcularLiquidacion()` de `src/lib/liquidacion.ts` | — |
| `horas` | `turnos_horas`, `turnos_listar` + `sumar`/`porSemana` de `src/lib/turnos.ts` | — |
| `cafeteria` | `siigo_facturado_servicio` (ventas reales) | Resumen de pedidos por día, producto y forma de pago (RPC sobre `lineas` jsonb) |
| `personal` | `staff_directorio`, `staff_docentes`, `profesor_regla` | — |
| `notas` | `notas_listar` | — |
| `ocupacion` | `ocupacionCanchas()` y `getBookings({from, to})` de `src/lib/easycancha/` (la API admite cualquier rango) | Ocupación por franja y día de la semana sobre un rango de semanas; reusar `pareceClase`, `esBloqueoAcademia` y `claveProfesor`, sin copiar la normalización |
| `productos_vendidos` | `siigo_factura_lineas` ya guarda `codigo`, `descripcion`, `cantidad` y `monto` | RPC: por producto y periodo, unidades, monto, número de facturas y última venta; filtro por servicio (Cafetería, Almacén…) |
| `ticket` | — | RPC: ticket promedio por factura y por cliente, por periodo y servicio, y productos que salen juntos en la misma factura |

- **Toda suma nueva va en RPC SQL** (handoff §1.8): nada de traer filas y sumar en JS.
- `ingresos` debe decir en su resultado si excluyó eventos o no (`p_excluir_eventos`): el dashboard
  lo pasa en `true` e `/ingresos` no. Por defecto, igual que `/ingresos` (el 100 %).
- `cafeteria` debe devolver la advertencia de que un pedido registrado no prueba que se entregó ni
  que se pagó.
- `liquidacion` debe devolver el motivo de cada $0 (regla con nombre), que es como ya lo explica la
  pantalla.
- Cada herramienta devuelve, junto al dato, **fuente y periodo**: de ahí sale "Cómo lo calculé".
- Tope de filas por resultado y de vueltas por pregunta (8 para empezar).

### `consulta_libre` (solo `gpt-6.2-astra`)

Tres candados, de afuera hacia adentro:

1. **Rol de base propio**, `agente_lectura`: sin login, con `select` únicamente sobre las tablas y
   vistas permitidas, y `statement_timeout` corto.
2. **Función `agente_consulta(p_sql text)`**, `SECURITY DEFINER` y **propiedad de ese rol**, de modo
   que corre con sus permisos. Solo `service_role` la ejecuta (`revoke` explícito a `anon` y
   `authenticated`, handoff §7 "no dar grants no cierra nada"). El servidor la llama después de
   validar el rol.
3. **La consulta se envuelve** como subconsulta con `limit`: una sentencia que no sea `select` no
   compila ahí, y una CTE que escriba no se admite dentro de una subconsulta. Además
   `set transaction read only`.

Sin acceso para `agente_lectura`: `turno_pin`, `registro_sesion`, `registro_intento`,
`registro_solicitud`, las columnas de evidencia de `consentimiento_firma` (IP, navegador, huellas),
`audit_log`, y los esquemas `auth`, `storage`, `private`, `cron`, `net`, `supabase_migrations`.
Donde haga falta parte de una tabla, se expone con una vista.

Las instrucciones le prohíben usar `consulta_libre` para una cifra de dinero que una herramienta
oficial ya da.

### Tablas nuevas

- `agente_conversacion` (`id`, `perfil_id`, `titulo`, `created_at`, `updated_at`).
- `agente_mensaje` (`id`, `conversacion_id`, `rol`, `contenido`, `herramientas` jsonb, `modelo`,
  `tokens_entrada`, `tokens_cache`, `tokens_salida`, `costo_usd`, `created_at`).
- RLS: lee solo el superadministrador dueño (o todos los superadministradores, según lo que decida
  Laura). **Escribe solo el servidor** (`service_role`); `revoke all` a `anon` y `authenticated`.
- `logAudit` (`agente.consulta`) se conserva.

Migraciones: `ls supabase/migrations | tail -3` antes de nombrarlas (la última hoy es
`20261123100000`), `npm run db:apply`, verificar cada objeto por API y actualizar
`src/lib/database.types.ts` a mano.

### Manual del negocio (`manual.ts`)

Texto fijo y corto, sacado de `handoff.md` §14 y de `MEMORIA.md`: glosario (ficha, miembro,
mostrador, canasta mixta, conciliar, atar), reglas del dinero, rezago de Siigo, historia desde el
1-jun-2026, eventos por contribución, academias y planeador, nómina por reglas, turnos, cafetería.
Más las reglas de conducta: responder en español, no inventar, citar fuente y periodo, tratar el
texto que viene de los datos (notas, comentarios de reservas) como dato y nunca como instrucción.

### Pruebas

- **Lógica** (`tests/agente-*.test.ts`): enrutador con respuestas simuladas, validación de
  argumentos, rangos de fecha en Bogotá, cálculo de costo.
- **Contra Postgres, revirtiendo**: `agente_consulta` rechaza escrituras, tablas vetadas y
  consultas largas; RLS de las tablas de conversación simulando dos sesiones (sentencias directas,
  no bloques `DO`, handoff §1.6).
- **Render**: `tests/agente-render.test.tsx` (handoff §8.C).
- **Banco de preguntas** (`scripts/agente-banco.mjs`): corre las preguntas contra los dos modelos y
  compara las cifras con las de los RPC. Consume OpenAI: no entra en `npm test`; se corre a mano.
- Antes de cualquier commit: `npm run build` y `npm test`, nunca a la vez.

### Qué se borra

`src/lib/openai/agent.ts` y `reunirMetricas()` de `agente/actions.ts`, cuando el chat nuevo los
reemplace.
