# Cruce: "HORARIOS ENTRENADORES.xlsx" vs plataforma (academia de tenis)

Fecha del cruce: 30 de septiembre de 2026. **APLICADO el mismo día** con `scripts/import-horarios-tenis.py`
tras las respuestas de Laura (Sebastián y todo lo viejo se apaga · colegios intactos · duraciones actuales,
60 min las nuevas · Yeison viernes 17:30 · niños nuevos con datos demo · "(PERSONALIZADA)" no es academia ·
las notas "no volvió" se ignoran). Resultado: 52 clases activas (46 con niños + 6 de colegio) · 119
matrículas activas · 0 niños sin día. Lo que quedó por confirmar está en
`docs/ninos-por-confirmar-tenis-2026-09-30.md`. Debajo, el cruce tal como se hizo ANTES de aplicar.

## A · Cómo leí el archivo

- 4 pestañas, una por entrenador: Cristian Castro, Juan Esteban Graciano, Jorge Pérez y Yeison Bedoya.
  Formato: fila = hora de inicio, columna = día (lunes a sábado), celda = niños separados por coma.
- **No trae duración** de las clases, ni documentos, ni fecha de nacimiento, ni cancha.
- Lo que **ignoré a propósito**: las celdas "APOYO A …" (el entrenador acompaña la clase de otro, no es una
  clase suya), "OFERTAR" (hueco libre), la fila 17 de Cristian (cuatro horas sueltas sin rótulo) y las notas
  de Graciano debajo de la rejilla (las listo al final por si sirven).
- La celda "0:00" del sábado de Graciano la tomé como **12:00** (viene después de las 11:00 y hoy esa
  clase existe a las 12:00 con los mismos dos niños).
- Sebastián Niño **no tiene pestaña** y los colegios (Montessori / Monte Luna) **no aparecen**.

## B · Lo que NO cambia: la lógica del módulo

El archivo se monta encima del modelo que ya existe, sin tocar código ni esquema:

| Regla vigente | Cómo se respeta al montar el archivo |
|---|---|
| La clase es **profesor + día + hora**, y no pertenece a una academia | Cada celda del Excel es una clase. Se crean las nuevas, se apagan (`activa = false`, no se borran) las que desaparecen |
| Recreativa/Competencia es **del niño** (su matrícula), no de la clase | Nadie cambia de academia salvo que el archivo lo diga. "(COMPETENCIA)" junto a Max Velásquez confirma que sigue en competencia |
| **Retirar no borra**: se apaga la matrícula y se sella la fecha | Los niños que ya no aparecen quedan retirados con fecha, con su historial |
| El cierre **sale solo del planeador** desde `vigente_desde` (1-oct-2026) | Ninguna clase se ha cerrado aún desde el planeador (verificado: 0), así que el cambio entra limpio el 1 de octubre, sin clases fantasma ni historial que proteger |
| Sin cupo, sin nivel, sin grupos con nombre | El archivo tampoco los trae. Nada que agregar |
| Un niño va a UNA academia por deporte (trigger) | Ningún niño del archivo choca con esto |
| Clases de colegio: 60 min, sin niños, pagadas con la regla de academia del profesor | Se dejan como están (ver duda 2) |
| Un profesor nuevo necesita perfil + alias de EasyCancha + reglas de pago | Yeison Bedoya ya tiene las tres (verificado) |
| Sin pausa activa | Verificado: no hay pausa abierta |

## C · Resumen en números

| | Hoy en la plataforma | En el archivo |
|---|---|---|
| Clases activas de tenis | 58 (52 con niños + 6 de colegio) | 47 con niños |
| Iguales (mismos niños) | | 15 |
| Cambian de niños | | 25 |
| Nuevas | | 7 (2 de Cristian, 5 de Yeison) |
| Desaparecen del archivo | | 18 (9 de Sebastián, 6 de colegio, 3 sueltas) |
| Niños matriculados hoy | 109 activos (96 recreativa · 13 competencia) | |
| Niños de hoy que no aparecen en el archivo | | 15 (8 de competencia, 7 de recreativa) |
| Niños del archivo que existen en la plataforma pero no están matriculados | | 11 |
| Nombres del archivo que **no existen** en la plataforma | | 14 |
| Nombres **ambiguos** (solo nombre de pila) | | 4 (Emma, Luciana, Julia, Renata) |

## D · Clase por clase

Leyenda: ✅ igual · ✏️ cambia · 🆕 nueva · ❌ no está en el archivo. "SIN RESOLVER" = nombre que no cruza
con nadie de la plataforma (ver sección F).

- ❌ **Cristian Castro · LUN 15:00** — NO ESTÁ en el Excel (hoy #38, 60 min, 1 niños: Lourdes Velasquez)
- ✅ **Cristian Castro · LUN 16:30** — igual (5 niños)
- ❌ **Cristian Castro · MAR 13:30** — NO ESTÁ en el Excel (hoy #100, 60 min, colegio Montessori)
- ✅ **Cristian Castro · MAR 15:30** — igual (5 niños)
- 🆕 **Cristian Castro · MAR 16:30** — CLASE NUEVA (5 niños): SAMUEL ARANGO, HELENA ZULUAGA, LUCAS SUAREZ, JULIA ZULUAGA, ISAAC
- 🆕 **Cristian Castro · MAR 17:30** — CLASE NUEVA (1 niños): MARIA PAZ
- ❌ **Cristian Castro · MIE 13:30** — NO ESTÁ en el Excel (hoy #101, 60 min, colegio Monte Luna)
- ✏️ **Cristian Castro · MIE 16:30** (#27, 60 min): ENTRAN Luciana Jaramillo Henao, Celeste Jeffus, Manuela Londoño, MAXIMILIANO FLOREZ MOLINA · SALEN Salvador Serna · SIN RESOLVER AGUSTIN URQUIZA
- ✏️ **Cristian Castro · MIE 17:30** (#43, 60 min): ENTRAN Victoria Lenis Orrego, Veronica Lenis Orrego · SIN RESOLVER SIMON URREA
- ✏️ **Cristian Castro · JUE 15:30** (#29, 60 min): ENTRAN Emma Pelaez, Melania El - Jamal · SALEN Pablo Jaramillo, Elena Giraldo · SIN RESOLVER ANTONIA MARIN, MATEO MARIN
- ✏️ **Cristian Castro · JUE 16:30** (#32, 60 min): ENTRAN Lucas Suarez · SALEN Emma Pelaez · SIN RESOLVER HELENA ZULUAGA, SAMUEL ARANGO, JULIA ZULUAGA
- ✏️ **Cristian Castro · SAB 09:00** (#44, 60 min): SIN RESOLVER RENATA GRACIANO
- ✅ **Cristian Castro · SAB 10:00** — igual (1 niños)
- ✏️ **Cristian Castro · SAB 11:00** (#52, 60 min): ENTRAN Victoria Lenis Orrego, Veronica Lenis Orrego · SIN RESOLVER ISABELLA ESPINOZA, EMMA
- ✏️ **Esteban Graciano · LUN 15:00** (#40, 60 min): ENTRAN Lourdes Velasquez, Leire Carrillo · SALEN Thomas Gutierrez
- ✅ **Esteban Graciano · LUN 16:00** — igual (3 niños)
- ✏️ **Esteban Graciano · LUN 17:30** (#7, 60 min): ENTRAN Valerie Carrillo Londoño, Valeria Tapias, Jose Pelaez · SALEN Samuel Echeverry · SIN RESOLVER MELISSA HURTADO · etiqueta: APOYO YEISON
- ❌ **Esteban Graciano · MAR 14:00** — NO ESTÁ en el Excel (hoy #102, 60 min, colegio Montessori)
- ✅ **Esteban Graciano · MAR 15:00** — igual (3 niños)
- ✏️ **Esteban Graciano · MAR 16:00** (#19, 60 min): ENTRAN Miranda Hernandez, Juanita Gutierrez · SALEN Martin Campos, Gabriel Campos
- ✏️ **Esteban Graciano · MAR 17:00** (#9, 60 min): ENTRAN Emma Hoyos
- ❌ **Esteban Graciano · MAR 17:30** — NO ESTÁ en el Excel (hoy #33, 60 min, 1 niños: Jose Pelaez)
- ❌ **Esteban Graciano · MIE 14:30** — NO ESTÁ en el Excel (hoy #103, 60 min, colegio Monte Luna)
- ✏️ **Esteban Graciano · MIE 15:00** (#41, 60 min): ENTRAN Maximiliano Velasquez · SALEN Mateo Salamanca, Leire Carrillo, Matías Restrepo, Elena Restrepo · etiqueta: COMPETENCIA
- ✅ **Esteban Graciano · MIE 16:00** — igual (3 niños)
- ✏️ **Esteban Graciano · MIE 17:30** (#8, 60 min): ENTRAN Valeria Tapias, Luciana Osorio, Jose Pelaez · SALEN Samuel Echeverry · SIN RESOLVER MELISSA HURTADO, SOFIA ESCAMILLA · etiqueta: APOYO SEBAS
- ✏️ **Esteban Graciano · JUE 15:00** (#11, 60 min): SALEN Cristobal Hincapie, Mateo Aguilera
- ✏️ **Esteban Graciano · JUE 16:00** (#42, 60 min): ENTRAN Cristobal Hincapie · SALEN Angel Colmenares
- ✅ **Esteban Graciano · JUE 17:00** — igual (5 niños)
- ❌ **Esteban Graciano · JUE 17:30** — NO ESTÁ en el Excel (hoy #34, 60 min, 1 niños: Jose Pelaez)
- ✏️ **Esteban Graciano · VIE 16:00** (#6, 90 min): SALEN Mauricio Aguilera
- ✏️ **Esteban Graciano · VIE 17:30** (#37, 60 min): ENTRAN EVELYN MONTILLA · SALEN Martin Montenegro, Elias Sotelo, Juan Manuel Otalvaro, Nicolas Suaza · etiqueta: PERSONALIZADA
- ✏️ **Esteban Graciano · SAB 08:00** (#36, 60 min): ENTRAN MAXIMILIANO FLOREZ MOLINA, Gabriela Cardona · SALEN Alicia Santa
- ✏️ **Esteban Graciano · SAB 09:00** (#12, 60 min): ENTRAN Alicia Santa
- ✏️ **Esteban Graciano · SAB 10:00** (#18, 60 min): ENTRAN Martin Campos, Gabriel Campos · SALEN Pascual Restrepo, Agustin Ocampo
- ✏️ **Esteban Graciano · SAB 11:00** (#35, 60 min): ENTRAN Simon Mosquera · SALEN Valeria Tapias · SIN RESOLVER PEDRO MORENO
- ✅ **Esteban Graciano · SAB 12:00** — igual (2 niños)
- ✏️ **Jorge Pérez · LUN 15:30** (#23, 60 min): SALEN Jaime Rincon
- ✏️ **Jorge Pérez · LUN 16:30** (#17, 60 min): ENTRAN Agustin Ocampo
- ✅ **Jorge Pérez · LUN 17:30** — igual (5 niños)
- ❌ **Jorge Pérez · MAR 14:30** — NO ESTÁ en el Excel (hoy #98, 60 min, colegio Montessori)
- ✅ **Jorge Pérez · MAR 15:30** — igual (3 niños)
- ✅ **Jorge Pérez · MAR 16:30** — igual (7 niños)
- ✅ **Jorge Pérez · MAR 17:30** — igual (5 niños)
- ❌ **Jorge Pérez · MIE 14:30** — NO ESTÁ en el Excel (hoy #99, 60 min, colegio Monte Luna)
- ✏️ **Jorge Pérez · MIE 15:30** (#25, 60 min): ENTRAN Christopher Jeffus · SIN RESOLVER LUCIANA
- ✏️ **Jorge Pérez · MIE 16:30** (#31, 60 min): SALEN Valeria Tapias
- ✏️ **Jorge Pérez · MIE 17:30** (#16, 60 min): ENTRAN Martin Montenegro, Simon Mosquera
- ✅ **Jorge Pérez · JUE 15:30** — igual (3 niños)
- ✅ **Jorge Pérez · JUE 16:30** — igual (6 niños)
- ✅ **Jorge Pérez · JUE 17:30** — igual (4 niños)
- ❌ **Sebastian Niño Mora · LUN 14:30** — NO ESTÁ en el Excel (hoy #45, 90 min, 2 niños: Isabel Duque(C), Santino Castaño Hernández(C))
- ❌ **Sebastian Niño Mora · LUN 16:00** — NO ESTÁ en el Excel (hoy #1, 90 min, 5 niños: Agustin Velasquez(C), Isabella Ostos(C), Maximiliano Pimienta(C), Maximiliano Velasquez(C), Miguel Mejia(C))
- ❌ **Sebastian Niño Mora · MAR 15:00** — NO ESTÁ en el Excel (hoy #46, 90 min, 2 niños: Isabel Duque(C), Santino Castaño Hernández(C))
- ❌ **Sebastian Niño Mora · MIE 14:30** — NO ESTÁ en el Excel (hoy #47, 90 min, 2 niños: Isabel Duque(C), Santino Castaño Hernández(C))
- ❌ **Sebastian Niño Mora · MIE 16:00** — NO ESTÁ en el Excel (hoy #2, 90 min, 5 niños: Agustin Velasquez(C), Isabella Ostos(C), Maximiliano Pimienta(C), Maximiliano Velasquez(C), Miguel Mejia(C))
- ❌ **Sebastian Niño Mora · JUE 15:00** — NO ESTÁ en el Excel (hoy #48, 90 min, 2 niños: Isabel Duque(C), Santino Castaño Hernández(C))
- ❌ **Sebastian Niño Mora · VIE 14:30** — NO ESTÁ en el Excel (hoy #49, 90 min, 2 niños: Isabel Duque(C), Santino Castaño Hernández(C))
- ❌ **Sebastian Niño Mora · VIE 16:00** — NO ESTÁ en el Excel (hoy #3, 90 min, 3 niños: Agustin Velasquez(C), Maximiliano Pimienta(C), Miguel Mejia(C))
- ❌ **Sebastian Niño Mora · SAB 08:00** — NO ESTÁ en el Excel (hoy #50, 120 min, 1 niños: Santino Castaño Hernández(C))
- 🆕 **Yeison Bedoya · LUN 18:30** — CLASE NUEVA (1 niños): ESTEBAN GIRALDO
- 🆕 **Yeison Bedoya · MAR 18:00** — CLASE NUEVA (2 niños): RENATA, JULIA
- 🆕 **Yeison Bedoya · MIE 15:00** — CLASE NUEVA (4 niños): ELENA RESTREPO, MATIAS RESTREPO, LEIRE CARRILLO, VALENTINO MEJIA
- 🆕 **Yeison Bedoya · JUE 18:00** — CLASE NUEVA (2 niños): RENATA, JULIA
- 🆕 **Yeison Bedoya · VIE 17:00** — CLASE NUEVA (3 niños): JUAN MANUEL OTALVARO, ELIAS SOTELO, NICOLAS SUAZA


Resumen clases: {'desaparecen': 18, 'iguales': 15, 'nuevas': 7, 'cambian': 25}

## E · Por niño

### Se retirarían (matriculados hoy, no aparecen en ninguna celda)
- Agustin Velasquez (competencia) — hoy en 3 clase(s): Sebastian Niño Mora LUN 16:00, Sebastian Niño Mora MIE 16:00, Sebastian Niño Mora VIE 16:00
- Angel Colmenares (recreativa) — hoy en 1 clase(s): Esteban Graciano JUE 16:00
- Isabel Duque (competencia) — hoy en 5 clase(s): Sebastian Niño Mora LUN 14:30, Sebastian Niño Mora MAR 15:00, Sebastian Niño Mora MIE 14:30, Sebastian Niño Mora JUE 15:00, Sebastian Niño Mora VIE 14:30
- Isabella Ostos (competencia) — hoy en 2 clase(s): Sebastian Niño Mora LUN 16:00, Sebastian Niño Mora MIE 16:00
- Jaime Rincon (recreativa) — hoy en 1 clase(s): Jorge Pérez LUN 15:30
- Mateo Aguilera (recreativa) — hoy en 1 clase(s): Esteban Graciano JUE 15:00
- Mauricio Aguilera (competencia) — hoy en 1 clase(s): Esteban Graciano VIE 16:00
- Maximiliano Pimienta (competencia) — hoy en 3 clase(s): Sebastian Niño Mora LUN 16:00, Sebastian Niño Mora MIE 16:00, Sebastian Niño Mora VIE 16:00
- Miguel Mejia (competencia) — hoy en 3 clase(s): Sebastian Niño Mora LUN 16:00, Sebastian Niño Mora MIE 16:00, Sebastian Niño Mora VIE 16:00
- Pablo Jaramillo (recreativa) — hoy en 1 clase(s): Cristian Castro JUE 15:30
- Pascual Restrepo (recreativa) — hoy en 1 clase(s): Esteban Graciano SAB 10:00
- Salvador Serna (recreativa) — hoy en 1 clase(s): Cristian Castro MIE 16:30
- Samuel Echeverry (competencia) — hoy en 2 clase(s): Esteban Graciano LUN 17:30, Esteban Graciano MIE 17:30
- Santino Castaño Hernández (competencia) — hoy en 6 clase(s): Sebastian Niño Mora LUN 14:30, Sebastian Niño Mora MAR 15:00, Sebastian Niño Mora MIE 14:30, Sebastian Niño Mora JUE 15:00, Sebastian Niño Mora VIE 14:30, Sebastian Niño Mora SAB 08:00
- Thomas Gutierrez (recreativa) — hoy en 1 clase(s): Esteban Graciano LUN 15:00

### Entrarían (existen en la plataforma, no están matriculados en tenis)
- EVELYN MONTILLA (m117, sin matrícula) → Esteban Graciano VIE 17:30
- Esteban Giraldo (m582, sin matrícula) → Yeison Bedoya LUN 18:30
- Lucas Suarez (m456, sin matrícula) → Cristian Castro MAR 16:30, Cristian Castro JUE 16:30
- Luciana Jaramillo Henao (m592, sin matrícula) → Cristian Castro MIE 16:30
- MAXIMILIANO FLOREZ MOLINA (m69, sin matrícula) → Cristian Castro MIE 16:30, Esteban Graciano SAB 08:00
- Manuela Londoño (m589, sin matrícula) → Cristian Castro MIE 16:30
- Maria Paz Ortiz (m446, sin matrícula) → Cristian Castro MAR 17:30
- Miranda Hernandez (m445, sin matrícula) → Esteban Graciano MAR 16:00
- Simon Mosquera (m130, sin matrícula) → Esteban Graciano SAB 11:00, Jorge Pérez MIE 17:30
- Veronica Lenis Orrego (m463, sin matrícula) → Cristian Castro MIE 17:30, Cristian Castro SAB 11:00
- Victoria Lenis Orrego (m462, sin matrícula) → Cristian Castro MIE 17:30, Cristian Castro SAB 11:00

### Se mueven (siguen, pero en otra clase)
- Agustin Ocampo: hoy Esteban SAB 10:00 → Jorge LUN 16:30
- Alicia Santa: hoy Esteban SAB 08:00, Jorge MIE 15:30 → Esteban SAB 09:00, Jorge MIE 15:30
- Celeste Jeffus: hoy Cristian LUN 16:30 → Cristian LUN 16:30, Cristian MIE 16:30
- Christopher Jeffus: hoy Jorge LUN 15:30 → Jorge LUN 15:30, Jorge MIE 15:30
- Cristobal Hincapie: hoy Esteban JUE 15:00, Esteban SAB 09:00 → Esteban JUE 16:00, Esteban SAB 09:00
- Elena Giraldo: hoy Cristian MAR 15:30, Cristian JUE 15:30 → Cristian MAR 15:30
- Elena Restrepo: hoy Esteban MIE 15:00 → Yeison MIE 15:00
- Elias Sotelo: hoy Esteban VIE 17:30, Jorge MAR 17:30 → Jorge MAR 17:30, Yeison VIE 17:00
- Emma Hoyos: hoy Esteban JUE 17:00 → Esteban MAR 17:00, Esteban JUE 17:00
- Emma Pelaez: hoy Cristian JUE 16:30 → Cristian JUE 15:30
- Gabriel Campos: hoy Esteban MAR 16:00 → Esteban SAB 10:00
- Gabriela Cardona: hoy Cristian MIE 16:30 → Cristian MIE 16:30, Esteban SAB 08:00
- Jose Pelaez: hoy Esteban MAR 17:30, Esteban JUE 17:30 → Esteban LUN 17:30, Esteban MIE 17:30
- Juan Manuel Otalvaro: hoy Esteban VIE 17:30 → Yeison VIE 17:00
- Juanita Gutierrez: hoy Esteban SAB 09:00 → Esteban MAR 16:00, Esteban SAB 09:00
- Leire Carrillo: hoy Esteban MIE 15:00 → Esteban LUN 15:00, Yeison MIE 15:00
- Lourdes Velasquez: hoy Cristian LUN 15:00 → Esteban LUN 15:00
- Luciana Osorio: hoy Jorge MAR 17:30, Jorge JUE 17:30 → Esteban MIE 17:30, Jorge MAR 17:30, Jorge JUE 17:30
- Martin Campos: hoy Esteban MAR 16:00 → Esteban SAB 10:00
- Martin Montenegro: hoy Esteban VIE 17:30, Jorge LUN 17:30 → Jorge LUN 17:30, Jorge MIE 17:30
- Mateo Salamanca: hoy Cristian LUN 16:30, Esteban MIE 15:00 → Cristian LUN 16:30
- Matías Restrepo: hoy Esteban MIE 15:00 → Yeison MIE 15:00
- Maximiliano Velasquez: hoy Sebastian LUN 16:00, Sebastian MIE 16:00 → Esteban MIE 15:00
- Melania El - Jamal: hoy Cristian MAR 15:30 → Cristian MAR 15:30, Cristian JUE 15:30
- Nicolas Suaza: hoy Esteban VIE 17:30, Jorge LUN 17:30, Jorge MIE 17:30 → Jorge LUN 17:30, Jorge MIE 17:30, Yeison VIE 17:00
- Valeria Tapias: hoy Esteban SAB 11:00, Jorge MIE 16:30 → Esteban LUN 17:30, Esteban MIE 17:30
- Valerie Carrillo Londoño: hoy Esteban MIE 17:30 → Esteban LUN 17:30, Esteban MIE 17:30

## F · Dudas que hay que resolver ANTES de montar (decisiones de producto)

### 1. Competencia y Sebastián Niño — la más grande
El archivo no trae pestaña de Sebastián. Hoy dicta **9 clases** (lun–vie 14:30/15:00 y 16:00, sáb 8:00)
con **7 niños de competencia**: Isabel Duque, Santino Castaño, Agustín Velásquez, Isabella Ostos,
Maximiliano Pimienta, Miguel Mejía y Maximiliano Velásquez.
- Si el archivo **solo cubre a los 4 entrenadores** y Sebastián sigue igual: dejo sus 9 clases intactas.
- Si Sebastián **ya no dicta**: se apagan sus 9 clases y esos 7 niños quedan retirados (o hay que decir
  a dónde van).
- Maximiliano Velásquez sí aparece: pasa a **Graciano, miércoles 15:00 "(COMPETENCIA)"**. ¿Sale de las
  de Sebastián o va a las dos?
- También desaparecen dos de competencia de Graciano: **Samuel Echeverry** (lun/mié 17:30) y
  **Mauricio Aguilera** (vie 16:00). ¿Se retiraron?

### 2. Colegios
Las 6 clases de colegio (Montessori martes, Monte Luna miércoles, con Jorge, Cristian y Graciano) no están
en el archivo, pero el archivo tampoco tiene filas a esas horas (13:30–14:30). **Asumo que siguen igual.**
Confírmame.

### 3. Duraciones y una hora dudosa
El archivo no dice cuánto dura cada clase. Propongo: **las clases que ya existen conservan su duración**
(60 min casi todas; 90 las de competencia de Graciano a las 16:00) y **las nuevas quedan en 60 min**.
- Yeison viernes: la rejilla dice **17:00** pero la nota de Graciano dice "ESTE GRUPO VA CON YEISON
  **5:30 PM A 6:30 PM**". ¿17:00 o 17:30?
- Yeison martes/jueves **18:00** y lunes **18:30**: son horas nuevas para la academia. ¿Son academia?
  (ver duda 5).

### 4. Catorce nombres que NO existen en la plataforma
Para matricularlos necesito crearles la persona dentro de una ficha familiar. **El importador no inventa
personas**: necesito por cada uno documento, fecha de nacimiento y a qué familia pertenece (o el correo o
celular del acudiente para encontrar la ficha). Sin eso, no se cargan y la clase queda con los que sí
existen.

| Nombre en el archivo | Dónde va | Pista |
|---|---|---|
| Samuel Arango | Cristian mar/jue 16:30 | no hay ningún Samuel Arango |
| Helena Zuluaga y Julia Zuluaga | Cristian mar/jue 16:30 | probablemente hermanas; ningún Zuluaga niño |
| Isaac (sin apellido) | Cristian mar 16:30 | |
| Agustín Urquiza | Cristian mié 16:30 | |
| Simón Urrea | Cristian mié 17:30 | hay un adulto Juan Urrea (ficha 228), ¿el papá? |
| Antonia Marín y Mateo Marín | Cristian jue 15:30 | hermanos; hay una Juliana Marín (ficha 559), ¿la mamá? |
| Renata Graciano | Cristian sáb 9:00 | ¿hija de Juan Esteban Graciano (ficha 186)? |
| Isabella Espinoza | Cristian sáb 11:00 | Mía y Guadalupe Espinoza están en la ficha 451, ¿hermana? |
| Melissa Hurtado | Graciano lun/mié 17:30 | |
| Sofía Escamilla | Graciano mié 17:30 | hay un Felipe Escamilla (ficha 74), ¿el papá? |
| Pedro Moreno | Graciano sáb 11:00 | hay Sophie y Mila Moreno en la ficha 214, ¿hermano? |
| Valentino Mejía | Yeison mié 15:00 | hay un Valentino Gómez (2016, ficha 473); ¿será él, mal escrito? |

### 5. Nombres ambiguos o que quizá NO son academia
| Nombre | Dónde | Duda |
|---|---|---|
| "EMMA" | Cristian sáb 11:00 | ¿Emma Peláez (2020), Emma Hoyos (2013) u otra Emma? |
| "LUCIANA" | Jorge mié 15:30 | ¿Luciana Osorio, Luciana Alzate, Luciana Londoño (2015, hermana de Manuela) u otra? |
| "RENATA, JULIA" | Yeison mar/jue 18:00 | Hay una Julia Vélez (2013). Renata no existe. ¿Es academia o clase particular? |
| Esteban Giraldo | Yeison lun 18:30 | Existe (ficha 568) pero sin fecha de nacimiento. ¿Niño de academia o adulto en particular? |
| Evelyn Montilla "(PERSONALIZADA)" | Graciano vie 17:30 | Existe (ficha 244). Por la etiqueta parece **clase particular, no academia**. Propongo NO cargarla en academias |

### 6. Cruces por parecido que quiero que confirmes
Estos existen en la plataforma con el nombre un poco distinto. Los tomo como la misma persona salvo que
digas lo contrario:
- María Paz → **María Paz Ortiz** (2020) · Maximiliano Flórez → **Maximiliano Flórez Molina** (2019) ·
  Luciana Jaramillo → **Luciana Jaramillo Henao** (2019) · Victoria y Verónica Lenis → **Lenis Orrego**
  (mellizas, 2017) · Gabriela Betancourt → **Gabriela Betancur Gallo** · Nicolás Betancourt → **Nicolás
  Betancur Gallo** · Simón Vélez → **Simón Vélez Uribe** · Clemente Ramírez → **Clemente Ramírez Arango** ·
  Mateo Salmanca → **Mateo Salamanca** · Viente Taborda → **Vicente Taborda** · Cristopher → **Christopher
  Jeffus**.
- **Simón Mosquera** (ficha 99) existe pero **sin documento ni fecha de nacimiento**. Va a Graciano sáb
  11:00 y Jorge mié 17:30. Habría que completarle la ficha.
- En el archivo "HELENA TORRES CRISTOPHER JEFFUS" venía sin coma; lo leí como dos niños.

### 7. Contradicciones entre la rejilla y las notas del archivo
- **Agustín Ocampo**: la nota dice "NO VOLVIÓ", pero la rejilla lo pone en **Jorge lunes 16:30**. Sigo la
  rejilla (lo muevo) salvo que digas que se retiró.
- **Cristóbal López Toro**: la nota dice "cambio Yeison", pero la rejilla lo deja en **Graciano lunes
  15:00** (donde Yeison figura como apoyo). Sigo la rejilla.
- **Lucas Ramírez** ("cambio Yeison"), **Rosario Giraldo**, **Rafael Moreno**, **Cristóbal Ramírez**: no
  existen en la plataforma ni están en la rejilla. No hago nada con ellos.
- **Lorenzo Bravo** "vuelve en octubre": lo dejo matriculado (mar 16:00 y jue 16:00).
- **Sara Salazar** "no volvió": coincide con lo ya decidido el 23-sep (no se carga).
- **Pascual Restrepo** "no volvió": coincide, no está en la rejilla → se retira.

### 8. Un dato de limpieza que encontré de paso
**Luciana Londoño está dos veces** en la plataforma (mismo documento 1035006857, fichas 573 y 574). No
afecta este cruce, pero si la "LUCIANA" de Jorge es ella, habría que fusionar primero.

## G · Cómo se montaría (cuando resuelvas las dudas)

1. Un importador nuevo para este formato de rejilla (`scripts/import-horarios-tenis.py`), con las mismas
   reglas del actual: **simulacro por defecto, `--apply` para escribir, idempotente, no inventa personas**, y
   listas explícitas (alias, no cargar, duraciones confirmadas) con quién decidió cada cosa y cuándo.
2. Qué haría, en orden: crear las clases nuevas (vigentes desde el **1-oct-2026**) · apagar las que
   desaparecen · agregar y quitar niños de cada clase · matricular a los que entran · retirar con fecha a
   los que ya no están.
3. Antes de escribir te muestro el simulacro con las cifras exactas, y después de escribir verifico contra
   la base (conteo de clases, matrículas y enlaces, y **0 niños sin día**).
4. Se actualiza `MEMORIA.md` con la nueva foto (hoy dice 52 clases · 109 niños · 175 enlaces).

## H · Notas sueltas del archivo, tal cual
- [Graciano] ROSARIO GIRALDO No Asistio mas
- [Graciano] LORENZO BRAVO LLEVA DOS SEMANAS SIN VENIR VUELVE EN OCTUBRE
- [Graciano] RAFAEL MORENO No Asistio mas
- [Graciano] SARA SALAZAR NO VOLVIO
- [Graciano] VALENTINO MEJIA Cambio a solo Miercoles
- [Graciano] ELENA RESTREPO, MATIAS RESTREPO, LEIRE CARRILLO, VALENTINO MEJIA, GRUPO YEISON 3:00 PM MIERCOLES
- [Graciano] JUAN MANUEL OTALVARO, ELIAS SOTELO, NICOLAS SUAZA ESTE GRUPO VA CON YEISON 5:30 PM A 6:30 PM
- [Graciano] PASCUAL RESTREPO NO VOLVIO · AGUSTIN OCAMPO NO VOLVIO
- [Graciano] LUCAS RAMIREZ Cambio Yeison · CRISTOBAL LOPEZ Cambio Yeison
- [Graciano] CRISTOBAL RAMIREZ COMUNICARSE POR QUE NO VOLVIO
- [Cristian, fila 17] 8:30 · 6:30 · 6:30 · 8:30 (sin rótulo; no sé qué son)
