import { describe, it, expect, vi, beforeEach } from "vitest";
import ExcelJS from "exceljs";
import { excelInscritos, type MatriculaExcel } from "../src/app/(app)/academias/exportar/excel";

/**
 * El Excel de inscritos por profesor, sin base de datos: se le pasan matrículas
 * inventadas y se vuelve a abrir el archivo para leer las celdas. La ruta se
 * prueba con un cliente falso: lo que importa de ella es quién entra y que un
 * fallo no baje un Excel vacío.
 */

const h = vi.hoisted(() => ({
  requireRole: vi.fn(async () => ({})),
  academias: { data: null as unknown, error: null as unknown },
  matricula: { data: [] as unknown[], error: null as unknown },
  nombres: new Map<string, string>(),
}));
vi.mock("@/lib/auth", () => ({ requireRole: h.requireRole }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({ select: async () => h.academias }),
    rpc: async () => h.matricula,
  }),
}));
vi.mock("@/lib/staff", () => ({ mapaNombresStaff: async () => h.nombres }));

const ANA = "11111111-1111-1111-1111-111111111111";
const BETO = "22222222-2222-2222-2222-222222222222";
const NOMBRES = new Map([
  [ANA, "Ana Ruiz"],
  [BETO, "Beto Gil"],
]);

const clase = (id: number, profesorId: string, dia: number, hora: string) => ({ id, dia, hora, profesorId });
const matricula = (miembro_id: number, nombre: string, clases: MatriculaExcel["clases"], o: Partial<MatriculaExcel> = {}): MatriculaExcel => ({
  miembro_id,
  nombre,
  edad: 10,
  academia: "Academia Recreativa Tenis",
  deporte: "tenis",
  clases,
  ...o,
});

async function abrir(buf: Buffer | ArrayBuffer) {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(buf instanceof ArrayBuffer ? buf : new Uint8Array(buf).buffer);
  return libro;
}

const armar = async (matriculas: MatriculaExcel[], nombres = NOMBRES) =>
  abrir(await excelInscritos({ rotulo: "Corte del martes 3 de noviembre de 2026", matriculas, nombres }));

/** Las filas de datos de una hoja, sin título ni encabezado. */
function filas(hoja: ExcelJS.Worksheet): unknown[][] {
  const salida: unknown[][] = [];
  hoja.eachRow((f, n) => {
    if (n > 4) salida.push((f.values as unknown[]).slice(1));
  });
  return salida;
}

describe("el Excel de inscritos por profesor", () => {
  it("un alumno que viene varios días es UNA fila, con todos sus horarios", async () => {
    const libro = await armar([
      matricula(1, "Echeverry, Samuel", [clase(10, ANA, 1, "17:30"), clase(11, ANA, 3, "17:30")]),
    ]);
    expect(filas(libro.getWorksheet("Ana Ruiz")!)).toEqual([
      ["Echeverry, Samuel", 10, "Academia Recreativa Tenis", "Lun 17:30 · Mié 17:30"],
    ]);
    // Dos clases y un alumno: el resumen cuenta personas, no cupos.
    expect(filas(libro.getWorksheet("Resumen")!)[0]).toEqual(["Ana Ruiz", "Tenis", 2, 1]);
  });

  it("el que tiene dos profesores sale en la hoja de cada uno, solo con sus horas de ese profesor", async () => {
    const libro = await armar([matricula(1, "Pérez, Sara", [clase(10, ANA, 1, "16:00"), clase(20, BETO, 5, "18:00")])]);
    expect(filas(libro.getWorksheet("Ana Ruiz")!)[0][3]).toBe("Lun 16:00");
    expect(filas(libro.getWorksheet("Beto Gil")!)[0][3]).toBe("Vie 18:00");
    const nota = filas(libro.getWorksheet("Resumen")!).at(-1)![0] as string;
    expect(nota).toContain("1 alumno en total");
    expect(nota).toContain("1 alumno tiene más de un profesor y sale en la hoja de cada uno");
  });

  it("ordena los alumnos por nombre y a los profesores con tenis primero", async () => {
    const libro = await armar([
      matricula(1, "Zuluaga, Eva", [clase(10, BETO, 1, "16:00")]),
      matricula(2, "Álvarez, Luz", [clase(10, BETO, 1, "16:00")]),
      matricula(3, "Mora, Tom", [clase(30, ANA, 2, "15:00")], { academia: "Academia Recreativa Pádel", deporte: "padel" }),
    ]);
    expect(libro.worksheets.map((w) => w.name)).toEqual(["Resumen", "Beto Gil", "Ana Ruiz"]);
    expect(filas(libro.getWorksheet("Beto Gil")!).map((f) => f[0])).toEqual(["Álvarez, Luz", "Zuluaga, Eva"]);
  });

  it("un profesor de los dos deportes tiene una hoja y una fila de resumen por deporte", async () => {
    const libro = await armar([
      matricula(1, "Uno, Ana", [clase(10, ANA, 1, "16:00")]),
      matricula(2, "Dos, Eva", [clase(30, ANA, 2, "15:00")], { academia: "Academia Recreativa Pádel", deporte: "padel" }),
    ]);
    expect(libro.worksheets.map((w) => w.name)).toEqual(["Resumen", "Ana Ruiz"]);
    expect(filas(libro.getWorksheet("Ana Ruiz")!)).toHaveLength(2);
    expect(filas(libro.getWorksheet("Resumen")!).slice(0, 2)).toEqual([
      ["Ana Ruiz", "Tenis", 1, 1],
      ["Ana Ruiz", "Pádel", 1, 1],
    ]);
  });

  it("el matriculado sin ningún día NO se pierde: sale en su propia hoja y en el resumen", async () => {
    const libro = await armar([matricula(1, "Sola, Ana", [])]);
    expect(filas(libro.getWorksheet("Sin profesor")!)[0]).toEqual(["Sola, Ana", 10, "Academia Recreativa Tenis", "Sin ningún día"]);
    expect(filas(libro.getWorksheet("Resumen")!)[0]).toEqual(["Sin profesor asignado", "—", 0, 1]);
  });

  it("si todos tienen profesor no aparece la hoja de sin profesor", async () => {
    const libro = await armar([matricula(1, "Uno, Ana", [clase(10, ANA, 1, "16:00")])]);
    expect(libro.getWorksheet("Sin profesor")).toBeUndefined();
  });

  it("la edad que falta queda vacía, no en cero", async () => {
    const libro = await armar([matricula(1, "Uno, Ana", [clase(10, ANA, 1, "16:00")], { edad: null })]);
    expect(filas(libro.getWorksheet("Ana Ruiz")!)[0][1]).toBeUndefined();
  });

  it("un nombre que Excel no acepta como hoja no revienta el archivo", async () => {
    const LARGO = "33333333-3333-3333-3333-333333333333";
    const LARGO2 = "44444444-4444-4444-4444-444444444444";
    const SIN = "55555555-5555-5555-5555-555555555555";
    const nombres = new Map([
      [LARGO, "María/Fernanda: de los Ángeles Restrepo Londoño"],
      [LARGO2, "María/Fernanda: de los Ángeles Restrepo Londoño"],
      [SIN, "—"],
    ]);
    const libro = await armar(
      [
        matricula(1, "Uno, Ana", [clase(1, LARGO, 1, "16:00")]),
        matricula(2, "Dos, Eva", [clase(2, LARGO2, 1, "16:00")]),
        matricula(3, "Tres, Luz", [clase(3, SIN, 1, "16:00")]),
      ],
      nombres,
    );
    const hojas = libro.worksheets.map((w) => w.name);
    expect(hojas).toHaveLength(4);
    expect(new Set(hojas).size).toBe(4);
    for (const n of hojas) {
      expect(n.length).toBeLessThanOrEqual(31);
      expect(n).not.toMatch(/[\\/?*[\]:]/);
    }
    expect(hojas).toContain("Profesor sin nombre");
  });

  it("sin alumnos arma el archivo y lo dice", async () => {
    const libro = await armar([]);
    expect(libro.worksheets.map((w) => w.name)).toEqual(["Resumen"]);
    expect(filas(libro.getWorksheet("Resumen")!).at(-1)![0]).toBe("Todavía no hay alumnos inscritos.");
  });
});

describe("la descarga de /academias/exportar", () => {
  const descargar = async () => {
    const { GET } = await import("../src/app/(app)/academias/exportar/route");
    return GET();
  };

  beforeEach(() => {
    h.requireRole.mockClear();
    h.academias = { data: [{ id: 26, nombre: "Academia Recreativa Tenis", deporte: "tenis" }], error: null };
    h.matricula = {
      data: [{ miembro_id: 1, nombre: "Uno, Ana", edad: 9, clases: [clase(10, ANA, 1, "16:00")] }],
      error: null,
    };
    h.nombres = NOMBRES;
  });

  it("la bajan los que editan academias; recepción no", async () => {
    await descargar();
    const [roles] = h.requireRole.mock.calls[0] as unknown as [string[]];
    expect([...roles].sort()).toEqual(["coord_admin", "coord_deportivo", "superadmin"]);
  });

  it("entrega el archivo con su nombre y sin guardarlo en caché", async () => {
    const r = await descargar();
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Disposition")).toMatch(/^attachment; filename="inscritos-por-profesor-\d{4}-\d{2}-\d{2}\.xlsx"$/);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    const libro = await abrir(await r.arrayBuffer());
    expect(libro.worksheets.map((w) => w.name)).toEqual(["Resumen", "Ana Ruiz"]);
  });

  it.each([
    ["falla la lectura de academias", () => (h.academias = { data: null, error: { message: "x" } })],
    ["no llega ninguna academia (RLS da 0 filas sin error)", () => (h.academias = { data: [], error: null })],
    ["falla la matrícula", () => (h.matricula = { data: [], error: { message: "x" } })],
    ["no se leen los profesores", () => (h.nombres = new Map())],
  ])("si %s responde error, no un Excel vacío", async (_caso, preparar) => {
    preparar();
    const r = await descargar();
    expect(r.status).toBe(500);
    expect(r.headers.get("Content-Disposition")).toBeNull();
  });
});
