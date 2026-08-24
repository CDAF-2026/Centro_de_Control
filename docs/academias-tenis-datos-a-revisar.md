# Academias de tenis · Datos para revisar con el club

Revisión del archivo **CDAF-academias-inscritos.xlsx** antes de cargarlo a la plataforma.
176 filas · 107 niños · solo tenis.

Todo lo de abajo **hay que confirmarlo con el club**. No se carga nada hasta que estos
casos estén resueltos, porque un dato mal aquí se arrastra a la asistencia y al cobro.

---

## 🔴 1. Tres documentos repetidos entre seis niños distintos

Esto es lo más importante del archivo. **No son errores de digitación en la edad: son
niños diferentes con el mismo número de documento.** Si se carga así, la plataforma
los va a tratar como una sola persona: la asistencia de uno le quedaría al otro, y lo
mismo la facturación.

### Caso 1 — Clemente y Valentín Ramírez Arango

Documento **1037607268**, usado por los dos. Parecen hermanos.

| Fila | Niño | Edad | Academia | Nivel | Horario | Profesor |
|---|---|---|---|---|---|---|
| 35 | CLEMENTE RAMIREZ ARANGO | 8 | Recreativa | Iniciación | Lun 15:30 | Jorge |
| 36 | CLEMENTE RAMIREZ ARANGO | 8 | Recreativa | Iniciación | Jue 15:00 | Esteban Graciano |
| 164 | VALENTIN RAMIREZ ARANGO | 10 | Competencia | Avanzado | Lun 16:00 | Esteban Graciano |
| 165 | VALENTIN RAMIREZ ARANGO | 10 | Competencia | Avanzado | Mié 16:00 | Esteban Graciano |
| 166 | VALENTIN RAMIREZ ARANGO | 10 | Competencia | Avanzado | Vie 16:00 | Esteban Graciano |

**Qué necesitamos:** el documento correcto de cada uno.

### Caso 2 — Luciana Osorio y Ema Hoyos

Documento **1040881722**. Apellidos distintos, no parecen familia.

| Fila | Niño | Edad | Academia | Nivel | Horario | Profesor |
|---|---|---|---|---|---|---|
| 74 | LUCIANA OSORIO | 13 | Recreativa | Intermedio | Mar 17:30 | Jorge |
| 75 | LUCIANA OSORIO | 13 | Recreativa | Intermedio | Jue 17:30 | Jorge |
| 102 | EMA HOYOS | 12 | Recreativa | Intermedio | Jue 17:00 | Esteban Graciano |

**Qué necesitamos:** el documento correcto de cada una.

### Caso 3 — Elena y Matías Restrepo

Documento **1017204187**. Parecen hermanos, y además están en la misma clase.

| Fila | Niño | Edad | Academia | Nivel | Horario | Profesor |
|---|---|---|---|---|---|---|
| 106 | ELENA RESTREPO | 5 | Recreativa | Iniciación | Mié 15:00 | Esteban Graciano |
| 151 | MATÍAS RESTREPO | 4 | Recreativa | Iniciación | Mié 15:00 | Esteban Graciano |

**Qué necesitamos:** el documento correcto de cada uno.

---

## 🟡 2. Tres documentos que no son cédula colombiana

No es un error, pero hay que decir de qué tipo son para registrarlos bien.

| Fila | Niño | Documento | Parece |
|---|---|---|---|
| 89, 90 | MAXIMILIANO ORTEGA | `CE1209531` | Cédula de extranjería |
| 177 | GUADALUPE ESPINOZA | `AU409983` | ¿Pasaporte? |

**Qué necesitamos:** confirmar el tipo (CE / pasaporte / otro).

---

## 🟡 3. Dos clases con más niños de los que permite la regla

La regla nueva es: **Iniciación 6 · Intermedio 5 · Avanzado 4** niños por franja.
De 60 franjas del archivo, dos la superan — las dos del mismo grupo:

| Academia | Nivel | Profesor | Horario | Cancha | Inscritos | Máximo | Edades |
|---|---|---|---|---|---|---|---|
| Recreativa | Avanzado | Jorge | **Mar 16:30** | 4 | **7** | 4 | 7, 8, 9, 9, 9, 9, 9 |
| Recreativa | Avanzado | Jorge | **Jue 16:30** | 4 | **6** | 4 | 7, 8, 9, 9, 9, 9 |

**No bloquea la carga** (así quedó decidido: el sistema avisa, no impide). Pero vale la
pena que el club mire si ese grupo hay que partirlo, o si para niños de 7 a 9 años el
tope de "avanzado" debería ser otro.

> Nota: al principio parecían cinco franjas excedidas. Tres eran de Competencia donde
> **dos profesores dan clase a la misma hora** — son dos grupos en paralelo, no una
> franja llena. Por eso el sistema cuenta el cupo por franja incluyendo profesor y cancha.

---

## ✅ 4. Lo que sí quedó limpio

- **Ningún niño de Competencia tiene nivel Iniciación** — la regla de que competencia
  solo tiene intermedio y avanzado ya se cumple en los datos.
- **Ningún nombre aparece con dos documentos distintos.**
- **Ninguna fila viene sin documento.**
- Las 176 filas tienen deporte, academia, nivel, día, hora y profesor completos.

---

## Resumen de lo que se necesita del club

1. Los documentos correctos de los **seis niños** de la sección 1.
2. El tipo de documento de **Maximiliano Ortega** y **Guadalupe Espinoza**.
3. Una mirada al grupo de **Jorge, martes y jueves 16:30**, que va con 6 y 7 niños.

Con eso el archivo queda listo para cargarse.
