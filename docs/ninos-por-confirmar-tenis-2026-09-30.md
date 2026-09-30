# Niños de la academia de tenis con datos por confirmar (30-sep-2026)

Sale del cruce del archivo "HORARIOS ENTRENADORES.xlsx" con la plataforma. Todo lo de abajo **ya está
montado** en el planeador; lo que falta es completar o corregir datos de personas.

## 1 · Quince niños creados con DATOS DEMO — pedir al club

Se crearon con nombre y apellido tal como venían en el archivo, **sin documento, sin fecha de nacimiento y
con un acudiente ficticio "POR CONFIRMAR"**. Hay que pedir por cada uno: tipo y número de documento,
fecha de nacimiento, EPS, RH, y del acudiente nombre, celular, correo y parentesco. Cuando lleguen los
datos se completan en la ficha (`/clientes/<ficha>`) y se reemplaza el acudiente demo.

| # | Niño (como viene en el archivo) | Clases | Ficha demo | Pista para el club |
|---|---|---|---|---|
| 1 | Samuel Arango | Cristian · mar y jue 16:30 | 578 | |
| 2 | Helena Zuluaga | Cristian · mar y jue 16:30 | 579 | hermana de Julia (misma ficha) |
| 3 | Julia Zuluaga | Cristian · mar y jue 16:30 | 579 | hermana de Helena |
| 4 | Isaac (sin apellido en el archivo) | Cristian · mar 16:30 | 580 | falta el apellido |
| 5 | Agustín Urquiza | Cristian · mié 16:30 | 581 | |
| 6 | Simón Urrea | Cristian · mié 17:30 | 582 | ¿hijo de Juan Urrea, ficha 228? |
| 7 | Antonia Marín | Cristian · jue 15:30 | 583 | hermana de Mateo (misma ficha); ¿hijos de Juliana Marín, ficha 559? |
| 8 | Mateo Marín | Cristian · jue 15:30 | 583 | hermano de Antonia |
| 9 | Renata Graciano | Cristian · sáb 9:00 | 584 | ¿hija del profesor Juan Esteban Graciano (ficha 186)? |
| 10 | Isabella Espinoza | Cristian · sáb 11:00 | 585 | ¿hermana de Mía y Guadalupe Espinoza (ficha 451)? Si sí, se mueve a esa ficha |
| 11 | Melissa Hurtado | Graciano · lun y mié 17:30 | 586 | |
| 12 | Sofía Escamilla | Graciano · mié 17:30 | 587 | ¿hija de Felipe Escamilla, ficha 74? |
| 13 | Pedro Moreno | Graciano · sáb 11:00 | 588 | ¿hermano de Sophie y Mila Moreno, ficha 214? |
| 14 | Valentino Mejía | Yeison · mié 15:00 | 589 | hay un Valentino Gómez (2016, ficha 473): ¿es el mismo niño con el apellido cambiado? |
| 15 | Renata (sin apellido en el archivo) | Yeison · mar y jue 18:00 | 590 | falta el apellido |

Si alguno resulta ser un niño que **ya existía** con otro nombre, se fusiona la ficha demo con la real (como
se hizo con Maximiliano Pimienta) y no se pierde nada.

## 2 · Tres nombres que NO se cargaron porque no se sabe quiénes son

En el archivo vienen **solo con el nombre de pila**, y en la plataforma hay varias personas con ese nombre.
No adiviné: quedaron **fuera de la clase** hasta que el club diga cuál es.

| Nombre en el archivo | Clase | Opciones que existen hoy en la plataforma |
|---|---|---|
| "EMMA" | Cristian · sáb 11:00 (con Guadalupe Espinoza y las mellizas Lenis) | Emma Peláez (2020) · Emma Hoyos (2013) · Emma Arráez (sin fecha) · u otra Emma nueva |
| "LUCIANA" | Jorge · mié 15:30 (con Laura Restrepo, Antonia Rozo, Alicia Santa, Helena Torres, Christopher Jeffus) | Luciana Osorio · Luciana Alzate · Luciana Londoño (2015, hermana de Manuela) · Luciana Jaramillo Henao (2019) · u otra |
| "JULIA" | Yeison · mar y jue 18:00 (con Renata) | Julia Vélez (2013) · Julia Maydankina · Julia Zuluaga (la nueva de Cristian) · u otra |

Con el apellido, se agregan desde la pantalla de la clase (`/academias/clase/…` → Agregar niño).

## 3 · Niños que ya existían pero les faltan datos

| Niño | Clases | Qué falta |
|---|---|---|
| Simón Mosquera (ficha 99) | Graciano sáb 11:00 · Jorge mié 17:30 | documento y fecha de nacimiento |
| Esteban Giraldo (ficha 568) | Yeison lun 18:30 | fecha de nacimiento (para saber si es niño de academia o adulto) |
| Valentín Ramírez (ficha 112) | Graciano lun/mié/vie 16:00 (competencia) | tiene el mismo documento de su hermano Clemente; falta el suyo |

## 4 · Una limpieza pendiente

**Luciana Londoño está dos veces** (fichas 573 y 574, mismo documento 1035006857). Si la "LUCIANA" de
Jorge es ella, hay que fusionar primero.
