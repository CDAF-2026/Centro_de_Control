# Despliegue a producción

Guía operativa. Escrita el 31-jul-2026, antes del primer despliegue.

## 1 · Variables de entorno en Vercel

**La app solo necesita estas 9.** Copia el valor de cada una desde tu `.env` local.
En Vercel: *Project → Settings → Environment Variables*, y márcalas para **Production**
y **Preview**.

| Variable | Para qué |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Dirección del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Llave pública (viaja al navegador, es normal) |
| `SUPABASE_SERVICE_ROLE_KEY` | 🔴 Llave de servicio. **Solo servidor.** Nunca con prefijo `NEXT_PUBLIC_` |
| `EASYCANCHA_API_URL` | Reservas (calendario y ocupación) |
| `EASYCANCHA_CLUB_ID` | ídem |
| `EASYCANCHA_TOKEN` | ídem |
| `OPENAI_API_KEY` | Solo la usa `/agente` |
| `RESEND_API_KEY` | Correos con marca |
| `RESEND_FROM` | Remitente de esos correos |

### ⚠️ Lo que NO hay que subir a Vercel

Estas viven en el `.env` de tu Mac y **solo las usan los scripts que corres a mano**
(`sync:siigo`, `sync:clientes`, `db:apply`, `match:siigo`…). Subirlas a Vercel no
sirve de nada y amplía la superficie expuesta:

`SUPABASE_ACCESS_TOKEN` · `SUPABASE_PROJECT_REF` · `SIIGO_USERNAME` ·
`SIIGO_ACCESS_KEY` · `SYNC_SECRET` · `DATABASE_URL` · `PGHOST` · `PGUSER` ·
`PGPASSWORD` · `PGDATABASE` · `PGPORT` · `OPENAI_IMAGE_MODEL` ·
`E2E_ADMIN_EMAIL` · `E2E_ADMIN_PASSWORD`

> `SIIGO_API_URL` y `SIIGO_PARTNER_ID` no están en `.env` y **está bien**: el código
> trae valores por defecto (`https://api.siigo.com` y `CentroDeportivoAlejandroFalla`).
>
> `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY` (sin `NEXT_PUBLIC_`) están en `.env`
> pero **no las lee nadie**. Son residuo; se pueden borrar.

## 2 · Crear el proyecto en Vercel

1. Conectar el repositorio de GitHub (`CDAF-2026/Centro_de_Control`).
2. Framework: Next.js (lo detecta solo). **No tocar** los comandos de build.
3. Pegar las 9 variables de arriba.
4. Deploy. Sale una dirección `…vercel.app`.
5. **Poner tope de gasto**: *Settings → Billing → Spend Management*. Se configura una
   vez y evita sorpresas.

Con la dirección `.vercel.app` ya se puede probar todo. El dominio real se apunta
después, cuando convenza.

## 3 · Después del primer despliegue: URLs de Auth

Hoy Supabase tiene `site_url = http://localhost:3000` y la lista de redirecciones
vacía.

**No bloquea el despliegue**: se entra con correo y contraseña, los usuarios se crean
ya confirmados desde `/empleados/nuevo` y no existe "olvidé mi contraseña". Ninguno
de esos caminos usa un enlace.

**Pero hay que arreglarlo antes de** conectar el SMTP de Supabase a Resend y habilitar
la recuperación de contraseña — que está en los pendientes. Si no, esos correos
llegarían con enlaces apuntando a `localhost` y nadie podría usarlos.

En *Authentication → URL Configuration*:
- **Site URL** → la dirección real de producción
- **Redirect URLs** → añadir esa misma y, si se quiere probar en Preview,
  `https://*.vercel.app`

## 4 · Prueba de humo (en este orden)

1. Entrar con tu usuario → debe caer en `/dashboard`.
2. Abrir `/clientes` y ver los 267 clientes.
3. Abrir `/ingresos` y cotejar una cifra contra Siigo.
4. Abrir `/notas`, crear una nota, comentarla y resolverla.
5. Abrir `/clases` y ver el calendario de EasyCancha (prueba que el token viajó bien).
6. Entrar con una cuenta que NO sea superadministrador → debe caer en `/notas` y
   **no** ver Dashboard, Liquidación, Reportes ni Config en el menú.

## 5 · Lo que NO cambia al desplegar

- **El sync de Siigo sigue corriendo en Supabase** (Edge Function `siigo-sync` +
  pg_cron, cada 20 min). No depende de Vercel ni necesita cron ahí.
- **Los scripts se siguen corriendo desde tu Mac.** Le pegan directo a las APIs y a
  Supabase; no pasan por el sitio web.
- **Los archivos** (avatares, documentos, soportes) están en Supabase Storage. Vercel
  no guarda nada en disco.

## 6 · Pendientes atados al despliegue

- [x] ~~Prueba de humo detrás del login~~ — hecha, todo OK (31-jul-2026).
- [x] ~~Cargar los correos reales de los 9 profesores~~ — hecho (31-jul-2026).
- [ ] **Resend con cuenta del CDAF.** En el primer despliegue se dejaron fuera
      `RESEND_API_KEY` y `RESEND_FROM` a propósito: las de `.env` son de Vena Digital.
      ⚠️ Mientras falten, **dos correos al cliente no salen y nadie se entera**: la
      confirmación al cerrarle una clase y la bienvenida al asignarle un paquete. No
      se rompe nada (ambos llamados hacen `console.error` y siguen), pero recepción no
      debe prometer un correo que no va a llegar. Al abrir la cuenta: verificar el
      dominio del club en Resend y agregar las dos variables en Vercel. Sin tocar código.
- [ ] **Rotar el PAT de Supabase y el `access_key` de Siigo** (quedaron expuestos en
      chat). Al rotarlos hay que actualizar `.env` y los secretos de la Edge Function.
- [ ] Crear el catálogo de paquetes: quedó vacío tras limpiar los datos de prueba, y
      sin él recepción no puede asignar paquetes.
- [ ] Apuntar el SMTP de Supabase a Resend → habilita "olvidé mi contraseña".
- [ ] Dominio propio y, con él, actualizar el `site_url` de Supabase (sección 3).
