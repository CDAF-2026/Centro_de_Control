import { describe, it, expect } from "vitest";
import { parsearReglamento, partirCapitulo } from "../src/lib/registro/reglamento";
import { consentimientoSchema } from "../src/lib/registro/esquemas";

/** Reglamento General (opción A, 8-oct-2026): estructura por capítulos/artículos y casilla obligatoria. */
const TEXTO = `Bienvenido a tu segundo hogar deportivo

El presente reglamento es emitido por el club.

# CAPÍTULO 1: CUIDADO Y BUEN USO DE NUESTRAS INSTALACIONES

Queremos que sea un lugar limpio.

## Artículo 1. Limpieza y Orden

Los usuarios deberán mantener limpios los espacios.

## Artículo 2. Trato Respetuoso

Primer párrafo.

Segundo párrafo.

# CAPÍTULO 2: RESERVAS

## Artículo 3. Cancelación

Doce horas.`;

describe("parsearReglamento", () => {
  it("separa preámbulo, capítulos con su intro y artículos con sus párrafos", () => {
    const r = parsearReglamento(TEXTO);
    expect(r.preambulo).toEqual(["Bienvenido a tu segundo hogar deportivo", "El presente reglamento es emitido por el club."]);
    expect(r.capitulos).toHaveLength(2);
    expect(r.capitulos[0].intro).toEqual(["Queremos que sea un lugar limpio."]);
    expect(r.capitulos[0].articulos.map((a) => a.titulo)).toEqual(["Artículo 1. Limpieza y Orden", "Artículo 2. Trato Respetuoso"]);
    expect(r.capitulos[0].articulos[1].parrafos).toEqual(["Primer párrafo.", "Segundo párrafo."]);
    expect(r.capitulos[1].articulos[0].parrafos).toEqual(["Doce horas."]);
  });
  it("partirCapitulo saca el número y el nombre en minúsculas con inicial", () => {
    expect(partirCapitulo("CAPÍTULO 3: ACADEMIAS DE TENIS Y PÁDEL")).toEqual({ numero: "3", nombre: "Academias de tenis y pádel" });
    expect(partirCapitulo("CAPÍTULO 7 – DISPOSICIONES COMPLEMENTARIAS")).toEqual({ numero: "7", nombre: "Disposiciones complementarias" });
    expect(partirCapitulo("CAPÍTULO 5 USO DEL PARQUE Y ZONAS COMUNES").numero).toBe("5");
  });
});

describe("consentimientoSchema · reglamento", () => {
  const base = {
    nombres: "Mariana", apellidos: "Gómez", tipoDocumento: "TI", documento: "1023456789", fechaNacimiento: "2017-03-14", eps: "Sura",
    acepto: "on", metodo: "dibujada", firmaPng: "data:image/png;base64," + "A".repeat(200),
  };
  it("sin la casilla del reglamento, rechaza y la señala", () => {
    const r = consentimientoSchema.safeParse(base);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.map((i) => i.path[0])).toContain("aceptoReglamento");
  });
  it("con las dos casillas, pasa", () => {
    expect(consentimientoSchema.safeParse({ ...base, aceptoReglamento: "on" }).success).toBe(true);
  });
});
