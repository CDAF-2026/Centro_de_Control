import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { excelHoras } from "../src/lib/turnos-excel";
import type { TurnoHoras, TurnoListado } from "../src/lib/database.types";

/**
 * El Excel del reporte de horas, armado sin base de datos: se le pasan turnos
 * inventados y se vuelve a abrir el archivo para leer las celdas.
 */

const ANA = "11111111-1111-1111-1111-111111111111";
const BETO = "22222222-2222-2222-2222-222222222222";

const dia = (perfil_id: string, d: string, o: Partial<TurnoHoras>): TurnoHoras => ({
  perfil_id,
  dia: d,
  semana: "2026-09-14",
  diurnas: 0,
  nocturnas: 0,
  extra_diurnas: 0,
  extra_nocturnas: 0,
  dom_diurnas: 0,
  dom_nocturnas: 0,
  dom_extra_diurnas: 0,
  dom_extra_nocturnas: 0,
  total: 0,
  ...o,
});

const turno = (id: number, perfil_id: string, o: Partial<TurnoListado>): TurnoListado => ({
  id,
  perfil_id,
  dia: "2026-09-14",
  inicio_el: "2026-09-14T12:00:00Z", // 7:00 a. m. en Bogotá
  fin_el: "2026-09-14T20:20:00Z", //    3:20 p. m.
  minutos: 440,
  minutos_pausa: 60,
  n_pausas: 1,
  pausa_abierta: false,
  foto_inicio_path: null,
  foto_fin_path: null,
  origen: "app",
  ajustado_por: null,
  ajuste_motivo: null,
  ...o,
});

async function abrir(buf: Buffer) {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(new Uint8Array(buf).buffer);
  return libro;
}

/** La fila (1-based) cuyo primer valor es `texto`. */
function filaDe(hoja: ExcelJS.Worksheet, texto: string): ExcelJS.Row {
  let encontrada: ExcelJS.Row | undefined;
  hoja.eachRow((f) => {
    if (!encontrada && f.getCell(1).value === texto) encontrada = f;
  });
  if (!encontrada) throw new Error(`no hay fila de ${texto}`);
  return encontrada;
}

const DATOS = {
  rotulo: "septiembre de 2026 · mes completo",
  personas: [
    { id: BETO, nombre: "Beto", role: "seguridad" as const },
    { id: ANA, nombre: "Ana", role: "recepcion" as const },
  ],
  horas: [
    dia(ANA, "2026-09-14", { diurnas: 440, total: 440 }),
    dia(BETO, "2026-09-14", { diurnas: 420, extra_diurnas: 90, dom_diurnas: 30, dom_nocturnas: 15, total: 555 }),
  ],
  turnos: [
    turno(1, ANA, {}),
    // Abierto: nunca marcó salida.
    turno(2, BETO, { dia: "2026-09-15", inicio_el: "2026-09-15T14:00:00Z", fin_el: null, minutos: null, n_pausas: 0, minutos_pausa: 0 }),
    // 9 h seguidas sin almuerzo, corregido a mano.
    turno(3, BETO, { minutos: 540, n_pausas: 0, minutos_pausa: 0, origen: "ajuste", ajuste_motivo: "olvidó marcar" }),
  ],
  pausas: new Map([[1, { inicio: "2026-09-14T17:00:00Z", fin: "2026-09-14T18:00:00Z" }]]),
  hoy: "2026-10-01",
};

describe("el Excel del reporte de horas", () => {
  it("trae dos pestañas: Resumen y Turnos, con el periodo en el título", async () => {
    const libro = await abrir(await excelHoras(DATOS));
    expect(libro.worksheets.map((h) => h.name)).toEqual(["Resumen", "Turnos"]);
    expect(libro.getWorksheet("Resumen")!.getCell("A2").value).toBe(DATOS.rotulo);
  });

  it("el resumen va en horas DECIMALES exactas, una fila por persona y en orden alfabético", async () => {
    const hoja = (await abrir(await excelHoras(DATOS))).getWorksheet("Resumen")!;
    const ana = filaDe(hoja, "Ana");
    const beto = filaDe(hoja, "Beto");
    expect(ana.number).toBeLessThan(beto.number);

    // Columnas: Empleado, Rol, Turnos, Diurnas, Nocturnas, Extra diu., Extra noct., Dominicales, Dom. extra, Total.
    // 440 min = 7,333…: se guarda exacto y solo se MUESTRA con dos decimales.
    expect(ana.getCell(4).value).toBeCloseTo(440 / 60, 10);
    expect(ana.getCell(4).numFmt).toBe("0.00");
    expect(ana.getCell(10).value).toBeCloseTo(440 / 60, 10);
    expect(ana.getCell(3).value).toBe(1);

    // "Dominicales" junta las diurnas y las nocturnas del domingo, igual que la pantalla.
    expect(beto.getCell(6).value).toBe(1.5);
    expect(beto.getCell(8).value).toBe(0.75);
    expect(beto.getCell(10).value).toBe(9.25);
    expect(beto.getCell(3).value).toBe(2);
  });

  it("no tiene fila de total general (decisión de Laura)", async () => {
    const hoja = (await abrir(await excelHoras(DATOS))).getWorksheet("Resumen")!;
    const primeras: unknown[] = [];
    hoja.eachRow((f) => primeras.push(f.getCell(1).value));
    expect(primeras.some((v) => typeof v === "string" && /^total/i.test(v))).toBe(false);
  });

  it("cada turno con su fecha, horas en hora de Colombia y almuerzo", async () => {
    const hoja = (await abrir(await excelHoras(DATOS))).getWorksheet("Turnos")!;
    const f = filaDe(hoja, "Ana");
    expect((f.getCell(2).value as Date).toISOString().slice(0, 10)).toBe("2026-09-14");
    expect(f.getCell(4).value).toBe("7:00 a. m.");
    expect(f.getCell(5).value).toBe("12:00 p. m.");
    expect(f.getCell(6).value).toBe("1:00 p. m.");
    expect(f.getCell(7).value).toBe("3:20 p. m.");
    expect(f.getCell(8).value).toBe(1);
    expect(f.getCell(9).value).toBeCloseTo(440 / 60, 10);
    expect(f.getCell(10).value).toBe("Con su usuario");
  });

  it("un turno SIN CERRAR no sale en cero: la celda queda vacía y lo dice", async () => {
    const hoja = (await abrir(await excelHoras(DATOS))).getWorksheet("Turnos")!;
    let abierta: ExcelJS.Row | undefined;
    hoja.eachRow((f) => {
      if (f.getCell(7).value === "sin marcar") abierta = f;
    });
    expect(abierta).toBeDefined();
    expect(abierta!.getCell(9).value ?? null).toBeNull();
    expect(String(abierta!.getCell(11).value)).toContain("Sin cerrar");
  });

  it("el turno de HOY sin salida dice «en curso», no «sin cerrar»", async () => {
    const hoy = turno(7, ANA, {
      dia: "2026-10-01",
      inicio_el: "2026-10-01T12:56:00Z",
      fin_el: null,
      minutos: null,
      n_pausas: 0,
      minutos_pausa: 0,
    });
    const hoja = (await abrir(await excelHoras({ ...DATOS, turnos: [hoy] }))).getWorksheet("Turnos")!;
    const f = filaDe(hoja, "Ana");
    expect(f.getCell(7).value).toBe("en curso");
    expect(String(f.getCell(11).value)).toContain("En curso");
    expect(String(f.getCell(11).value)).not.toContain("Sin cerrar");
  });

  it("avisa del turno largo sin almuerzo y del corregido a mano", async () => {
    const hoja = (await abrir(await excelHoras(DATOS))).getWorksheet("Turnos")!;
    const notas: string[] = [];
    hoja.eachRow((f) => notas.push(String(f.getCell(11).value ?? "")));
    const nota = notas.find((n) => n.includes("Sin almuerzo"));
    expect(nota).toBeDefined();
    expect(nota).toContain("Corregido a mano: «olvidó marcar»");
  });

  it("una salida de OTRO día lleva su fecha y se marca para revisar", async () => {
    // Caso real de sep-2026: entró el 1 a las 7 a. m. y la salida quedó el 21.
    const largo = turno(9, ANA, {
      dia: "2026-09-01",
      inicio_el: "2026-09-01T12:09:00Z",
      fin_el: "2026-09-21T11:58:00Z",
      minutos: 28789,
      n_pausas: 0,
      minutos_pausa: 0,
    });
    const hoja = (await abrir(await excelHoras({ ...DATOS, turnos: [largo] }))).getWorksheet("Turnos")!;
    const f = filaDe(hoja, "Ana");
    expect(f.getCell(7).value).toBe("6:58 a. m. (lun 21 sep)");
    expect(String(f.getCell(11).value)).toContain("La salida es de otro día");
  });

  it("un periodo sin turnos no revienta y lo dice", async () => {
    const libro = await abrir(
      await excelHoras({ ...DATOS, horas: [], turnos: [], pausas: new Map() }),
    );
    const hoja = libro.getWorksheet("Turnos")!;
    const textos: unknown[] = [];
    hoja.eachRow((f) => textos.push(f.getCell(1).value));
    expect(textos).toContain("No hay turnos en este periodo.");
    // Las personas siguen saliendo, en cero: que alguien no marque es información.
    expect(filaDe(libro.getWorksheet("Resumen")!, "Ana").getCell(10).value).toBe(0);
  });
});
