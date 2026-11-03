import ExcelJS from "exceljs";
import { AMBAR, encabezado, pintar, titulo } from "@/lib/turnos-excel";
import type { Deporte } from "@/lib/database.types";
import { DEPORTE_NOMBRE, DIA_CORTO } from "../ui";

/**
 * El Excel de inscritos por profesor (`/academias/exportar`), pedido por Laura el
 * 3-nov-2026 para el coordinador deportivo.
 *
 * Una pestaña "Resumen" y una por profesor, con sus alumnos.
 *
 * ⚠️ Un alumno es UNA fila por profesor aunque venga varios días: el planeador
 * suma por clase, así que a Graciano le muestra 72 "niños" donde hay 47 alumnos.
 * Y el que tiene dos profesores sale en la hoja de cada uno, por eso la columna
 * del resumen no cuadra con el total del club y la nota de abajo lo dice.
 *
 * Esta función no consulta nada: recibe los datos ya leídos, para que la prueba
 * pueda armar el archivo sin base de datos.
 */

export type MatriculaExcel = {
  miembro_id: number;
  nombre: string;
  edad: number | null;
  academia: string;
  deporte: Deporte;
  clases: { id: number; dia: number; hora: string; profesorId: string | null }[];
};

export type DatosExcelInscritos = {
  /** "Corte del martes 3 de noviembre de 2026" — va en el título de cada pestaña. */
  rotulo: string;
  matriculas: MatriculaExcel[];
  nombres: Map<string, string>;
};

type Alumno = { nombre: string; edad: number | null; academia: string; horario: string };
type Profesor = {
  id: string;
  nombre: string;
  alumnos: (Alumno & { deporte: Deporte })[];
  clases: Map<Deporte, Set<number>>;
};

const COLUMNAS_ALUMNOS = ["Alumno", "Edad", "Academia", "Días y horas"];
const DEPORTES: Deporte[] = ["tenis", "padel"];
const orden = (a: string, b: string) => a.localeCompare(b, "es");
const alumnos = (n: number) => `${n} ${n === 1 ? "alumno" : "alumnos"}`;

/** "Lun 17:30 · Mié 17:30". El RPC ya las trae ordenadas por día y hora. */
const horarioDe = (clases: MatriculaExcel["clases"]) =>
  clases.map((c) => `${DIA_CORTO[c.dia]} ${c.hora}`).join(" · ");

/** Excel no acepta más de 31 caracteres, ni estos signos, ni dos hojas iguales. */
function nombreHoja(nombre: string, usadas: Set<string>): string {
  const limpio = nombre.replace(/[\\/?*[\]:']/g, " ").replace(/\s+/g, " ").trim().slice(0, 31).trim() || "Profesor";
  let hoja = limpio;
  for (let i = 2; usadas.has(hoja.toLowerCase()); i++) {
    const sufijo = ` ${i}`;
    hoja = limpio.slice(0, 31 - sufijo.length).trim() + sufijo;
  }
  usadas.add(hoja.toLowerCase());
  return hoja;
}

function hojaDeAlumnos(libro: ExcelJS.Workbook, nombre: string, encabezadoHoja: string, rotulo: string, lista: Alumno[]) {
  const hoja = libro.addWorksheet(nombre);
  titulo(hoja, encabezadoHoja, `${alumnos(lista.length)} · ${rotulo}`, COLUMNAS_ALUMNOS.length);
  encabezado(hoja, COLUMNAS_ALUMNOS);
  hoja.columns = [{ width: 36 }, { width: 7 }, { width: 28 }, { width: 44 }];
  // La lista de un profesor se imprime: que quepa a lo ancho de la hoja.
  hoja.pageSetup = { fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  for (const a of [...lista].sort((x, y) => orden(x.nombre, y.nombre))) {
    hoja.addRow([a.nombre, a.edad, a.academia, a.horario]).getCell(4).alignment = { wrapText: true, vertical: "top" };
  }
}

export async function excelInscritos(d: DatosExcelInscritos): Promise<Buffer> {
  const porProfesor = new Map<string, Profesor>();
  const sinProfesor: Alumno[] = [];
  // De cuántos profesores es cada niño, para la nota del resumen.
  const profesoresDe = new Map<number, Set<string>>();

  for (const m of d.matriculas) {
    const profes = profesoresDe.get(m.miembro_id) ?? new Set<string>();
    profesoresDe.set(m.miembro_id, profes);

    const suyas = new Map<string, MatriculaExcel["clases"]>();
    for (const c of m.clases) {
      if (!c.profesorId) continue;
      suyas.set(c.profesorId, [...(suyas.get(c.profesorId) ?? []), c]);
    }

    const base = { nombre: m.nombre, edad: m.edad, academia: m.academia };
    // ⚠️ Matriculado y sin ningún día NO puede perderse: la suma de las hojas no
    // cuadraría con la matrícula y nadie sabría por qué. Hoy son 0.
    if (suyas.size === 0) sinProfesor.push({ ...base, horario: "Sin ningún día" });

    for (const [id, clases] of suyas) {
      profes.add(id);
      let p = porProfesor.get(id);
      if (!p) {
        const nombre = d.nombres.get(id);
        p = { id, nombre: nombre && nombre !== "—" ? nombre : "Profesor sin nombre", alumnos: [], clases: new Map() };
        porProfesor.set(id, p);
      }
      p.alumnos.push({ ...base, deporte: m.deporte, horario: horarioDe(clases) });
      const delDeporte = p.clases.get(m.deporte) ?? new Set<number>();
      for (const c of clases) delDeporte.add(c.id);
      p.clases.set(m.deporte, delDeporte);
    }
  }

  // Tenis primero, como en el resto del módulo, y dentro de cada deporte por nombre.
  const profesores = [...porProfesor.values()].sort(
    (a, b) => Number(!a.clases.has("tenis")) - Number(!b.clases.has("tenis")) || orden(a.nombre, b.nombre),
  );

  const libro = new ExcelJS.Workbook();
  libro.creator = "Centro de Control CDAF";
  libro.created = new Date();

  // ── Pestaña 1: Resumen ────────────────────────────────────────────────────
  const resumen = libro.addWorksheet("Resumen");
  const rotulos = ["Profesor", "Deporte", "Clases con alumnos", "Alumnos"];
  titulo(resumen, "Inscritos por profesor", d.rotulo, rotulos.length);
  encabezado(resumen, rotulos);
  resumen.columns = [{ width: 32 }, { width: 11 }, { width: 11 }, { width: 11 }];

  for (const p of profesores) {
    for (const dep of DEPORTES) {
      const clases = p.clases.get(dep);
      if (!clases) continue;
      resumen.addRow([p.nombre, DEPORTE_NOMBRE[dep], clases.size, p.alumnos.filter((a) => a.deporte === dep).length]);
    }
  }
  if (sinProfesor.length) pintar(resumen.addRow(["Sin profesor asignado", "—", 0, sinProfesor.length]), AMBAR);

  resumen.addRow([]);
  const conVarios = [...profesoresDe.values()].filter((s) => s.size > 1).length;
  const nota = d.matriculas.length
    ? `${alumnos(profesoresDe.size)} en total. Cada alumno cuenta una vez por profesor, aunque venga varios días a la semana.` +
      (conVarios
        ? ` ${conVarios === 1 ? "1 alumno tiene" : `${conVarios} alumnos tienen`} más de un profesor y sale${conVarios === 1 ? "" : "n"} en la hoja de cada uno.`
        : "")
    : "Todavía no hay alumnos inscritos.";
  resumen.addRow([nota]).font = { italic: true, size: 9, color: { argb: "FF6B7780" } };

  // ── Una pestaña por profesor ──────────────────────────────────────────────
  const usadas = new Set(["resumen"]);
  for (const p of profesores) {
    hojaDeAlumnos(libro, nombreHoja(p.nombre, usadas), `Inscritos de ${p.nombre}`, d.rotulo, p.alumnos);
  }
  if (sinProfesor.length) {
    hojaDeAlumnos(libro, nombreHoja("Sin profesor", usadas), "Matriculados sin profesor", d.rotulo, sinProfesor);
  }

  return Buffer.from(await libro.xlsx.writeBuffer());
}
