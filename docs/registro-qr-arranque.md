# Registro por QR y consentimiento digital · Guía de arranque para el club

Fecha: 2 de octubre de 2026 · Centro Deportivo Alejandro Falla · Vena Digital

## Qué es

Un código QR en recepción. El papá, la mamá o el propio deportista adulto lo escanea con el
celular y, sin descargar nada ni crear usuario:

1. **Actualiza o ingresa los datos** del deportista (4 pasos cortos: el deportista,
   contacto, acudiente, facturación; un adulto no ve el paso del acudiente), o
2. **Firma el consentimiento informado** con el dedo (o escribiendo su nombre). Un adulto
   firma en nombre propio con el texto de mayores de edad; el acudiente firma por el menor con
   el de menores. La edad que se escribe decide cuál texto sale.

Al firmar, la persona marca dos casillas: **"Apruebo"** el consentimiento y **"Conozco y acepto el
Reglamento General"** (el reglamento se abre a un toque desde ahí y vive en
https://alejandrofallacd.com/registro/reglamento, con descarga en PDF; se puede compartir solo).
Al firmar se genera un PDF con la firma y la evidencia (fecha, hora, dispositivo), queda
guardado en la ficha del niño en la plataforma, en la tarjeta **"Consentimientos
informados"**, y **el papá recibe una copia en su correo** (si lo escribió). Un PDF por cada niño; si tiene hermanos, se firma uno por cada uno (la
página lo ofrece al terminar: "Registrar otro hijo(a)").

Dirección: **https://alejandrofallacd.com/registro**

## Antes del día de arranque

| Qué | Quién | Estado |
|---|---|---|
| Imprimir el QR (archivo `qr-registro-logo.png` o el `.svg` para el diseñador) | Club / diseñador | Pendiente |
| Decidir el día en que se pone el QR en recepción | Club | Pendiente |
| Prender la página pública (`REGISTRO_PUBLICO=1` en Vercel) **ese mismo día** | Vena Digital | Hecho el 5-oct-2026 |
| Borrar las fichas de prueba | Vena Digital | Hecho (2 y 5-oct-2026) |
| Prueba real: escanear el QR impreso, registrar un niño de prueba, firmar y verlo en la ficha; luego anular la firma con motivo | Laura | Hecho el 5-oct-2026 |

Mientras la página no esté prendida, el QR lleva a una pantalla que dice **"Estamos
preparando el registro"**. No pasa nada malo si alguien lo escanea antes.

## Quién revisa, y qué

Solo el **superadministrador** y el **coordinador administrativo** ven el menú
**Clientes › Registros**. Allí llegan tres cosas, y cada una trae una nota automática
en el tablón:

| Llega a la bandeja | Cuándo pasa | Qué hacer |
|---|---|---|
| **Facturación por aprobar** | La ficha ya tenía facturación y la familia escribió un NIT o una razón social **distinta**. Al papá no se le frena: sigue y firma; el cambio queda esperando | Comparar "hoy" vs "propuesto". **Aprobar** (y el sistema ata las facturas de Siigo de ese NIT) o **rechazar** con motivo |
| **Firmas por asignar** | Dos fichas tienen exactamente el mismo documento y el mismo nombre del niño (hermanos con documento repetido, por ejemplo) | Elegir a qué niño pertenece la firma. El PDF se crea en esa ficha |
| **Datos por asignar** | Mismo caso, pero con el formulario de datos | Elegir la ficha a la que se aplican, o descartar con motivo |

Todo lo demás se aplica solo: si el niño ya existía, sus datos se **actualizan con lo
que escribió el papá** (celular, correo, EPS, RH, dirección, acudiente…). Si no existía,
se crea. Si el papá ya era cliente, el niño entra como **hijo** en su ficha.

## Qué decirle a un papá

| Situación | Respuesta |
|---|---|
| "Firmé y me dice *No encontramos ese registro*" | El niño no está en la plataforma con esos datos. Que use **"Actualizar o ingresar datos"**: al terminar pasa directo a firmar |
| "¿Tengo que crear usuario o contraseña?" | No. Se entra por el QR y no hay cuenta |
| "Tengo dos hijos" | Se registra uno, se firma, y al final la página ofrece **"Registrar otro hijo(a)"** |
| "Me equivoqué en un dato" | Puede volver a escanear y hacerlo de nuevo: lo nuevo reemplaza lo anterior. La firma no se repite: si el niño ya tiene firma vigente, la página lo dice y no crea otra |
| "Me dice *Revisa el documento: no coincide con el nombre*" | Escribió un documento que en la plataforma es de otra persona (casi siempre su propia cédula en el campo del niño). Que lo corrija. Si insiste en que es correcto, al segundo intento puede marcar "Confirmo…": no se toca ninguna ficha y les llega a **Registros** para revisarlo |
| "Me pide facturación y yo no facturo a nombre de una empresa" | Elige **la madre** o **el padre** (o "a mi nombre" si es un adulto): el club factura a nombre de esa persona |
| "Soy adulto, ¿tengo que firmar el consentimiento?" | Sí, en nombre propio y con el texto de mayores de edad. Llena sus datos y al final firma, igual que los papás por sus hijos |
| "Lo hice desde el computador" | Funciona igual; la firma se puede dibujar con el ratón o escribir el nombre |
| "¿Dónde está el reglamento del club?" | https://alejandrofallacd.com/registro/reglamento (se lee por capítulos y se descarga en PDF). Al firmar el consentimiento ya quedó aceptado |
| "No me llegó el PDF al correo" | Llega solo si escribió su correo al firmar; revisar spam. El PDF siempre está en la ficha y se le puede reenviar desde **Documentos** |
| "Dice *Demasiados intentos*" | Hay un tope por conexión (60 envíos cada 10 minutos y 400 al día; el wifi del club cuenta como una sola conexión). Esperar unos minutos o hacerlo con datos móviles |

## Dónde se ve en la plataforma

- **Ficha del cliente** → tarjeta **Consentimientos informados** (por cada niño: firmado o no,
  con enlace al PDF) y **Documentos** (el PDF, que no se puede eliminar).
- **Ficha del cliente** → aviso "La familia propuso N cambios de facturación" con enlace a
  la bandeja.
- **Clientes › Registros** → la bandeja y el historial de lo aplicado.
- **Notas** → cada caso que necesita revisión llega como "Aviso automático".

## Si algo no funciona

- La página dice "Estamos preparando el registro": falta prender `REGISTRO_PUBLICO` en Vercel
  o no hay versión vigente del texto. Avisar a Vena Digital.
- Un papá dice que firmó y en la ficha no aparece: buscar en **Clientes › Registros › Firmas
  por asignar** (puede haber quedado pendiente por un documento repetido).
- Hay que cambiar el texto del consentimiento: **no se edita el vigente**. Se crea una
  versión nueva (Vena Digital) y desde ese día las firmas salen con ella; las anteriores
  siguen valiendo con su versión.
