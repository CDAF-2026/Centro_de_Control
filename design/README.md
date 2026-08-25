# Bocetos — rendimiento por franja de un grupo de academia

Tres formas de leer el rendimiento de las franjas de un grupo, dibujadas el
**25-ago-2026** sobre los datos reales del grupo Mulán (14 franjas, 28 niños).
Las franjas, profesores, canchas, cupos y nombres son reales; **los porcentajes
de asistencia son inventados**, porque todavía no hay historia.

| Archivo | Idea | A favor | En contra |
|---|---|---|---|
| `Main.dc.html` | **A · Lista con semáforo** — el acordeón de siempre, ordenado por lo que pide atención | Es lo más cercano a lo que ya hay | Con 14 franjas sigue habiendo scroll |
| `Semana.dc.html` | **B · La semana de un vistazo** — rejilla día × hora, color = asistencia | Se ve de un golpe dónde está el hueco | No muestra tendencia; a un grupo de 3 franjas la rejilla le queda grande |
| `Tendencia.dc.html` | **C · Fichas con tendencia** — cada franja con su curva | Dice hacia dónde va, que es lo que un promedio esconde | Ocupa más y necesita 6+ semanas de datos |

## 🚫 Se decidió NO implementar ninguna (Laura, 25-ago-2026)

Tres razones, en orden de peso:

1. **La ficha del grupo ya hace casi todo eso.** Ya muestra por franja
   "N clases · X% asistencia", la barra de ocupación, el cupo y el aviso cuando
   algo va mal; y por niño, su barra de asistencia individual. Lo que los
   bocetos agregan encima es sobre todo peso visual.
2. **El cuello de botella no es la pantalla, son los datos.** En agosto se
   registraron **2 clases de academia** de las ~250 que tocaban. Cualquiera de
   los tres montado hoy muestra rayas, y una primera impresión de "esto no
   sirve" no se recupera.
3. **La ficha del grupo tiene un trabajo DIARIO** (¿quién viene el martes?,
   cambiar días, retirar, inscribir) y analizar rendimiento es un trabajo
   MENSUAL. Meter lo mensual en la pantalla diaria le cobra impuesto a la
   diaria — el mismo error que se acababa de corregir quitando la tabla de 48
   filas de la ficha de la academia.

**Lo único que sí se hizo**: ordenar las franjas por lo que pide atención y
darle nombre al problema. Sin elementos nuevos.

## Cuándo volver a esto

Cuando pasen **las dos** cosas, no una:

1. Que haya **6 semanas de clases registradas** de verdad.
2. Que **el coordinador pregunte** "¿esta franja va mejorando o empeorando?".
   Si la pregunta sale de él, la respuesta se gana su sitio.

Ahí la buena es la **Opción C**, y el diseño ya está hecho.
