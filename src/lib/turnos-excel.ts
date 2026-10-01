import ExcelJS from "exceljs";
import { diaCorto, diaIso, horaCorta } from "@/lib/fecha";
import { ROLE_LABEL } from "@/lib/roles";
import {
  COLUMNAS,
  SIN_ALMUERZO_DESDE_MIN,
  enCurso,
  hoyTurnos,
  minutosExtra,
  sumar,
  valorColumna,
} from "@/lib/turnos";
import type { AppRole, TurnoHoras, TurnoListado } from "@/lib/database.types";

/**
 * El Excel del reporte de horas (`/horas/exportar`), pedido por Laura el 1-oct-2026.
 *
 * Dos pestañas: "Resumen" (la misma tabla de la pantalla, una fila por persona)
 * y "Turnos" (turno por turno). Las horas van en DECIMALES (7 h 30 min = 7,5),
 * decisión de Laura: así se multiplican directo por el valor de la hora.
 *
 * ⚠️ Cada celda guarda el valor EXACTO (minutos ÷ 60) y solo se MUESTRA con dos
 * decimales. Si se guardara ya redondeado, 7:20 quedaría en 7,33 y la suma de
 * varios días en Excel se alejaría unos centésimos del total del reporte.
 *
 * Esta función no consulta nada: recibe los datos ya leídos, para que la prueba
 * pueda armar el archivo sin base de datos.
 */

export type DatosExcelHoras = {
  /** "septiembre de 2026 · quincena 1 (1–15)" — va en el título de cada pestaña. */
  rotulo: string;
  personas: { id: string; nombre: string | null; role: AppRole }[];
  horas: TurnoHoras[];
  turnos: TurnoListado[];
  /** Primer almuerzo de cada turno (el mismo criterio que el detalle en pantalla). */
  pausas: Map<number, { inicio: string; fin: string | null }>;
  /** Hoy en Colombia ("2026-10-01"); por defecto, el de verdad. Las pruebas lo fijan. */
  hoy?: string;
};

const FORMATO_HORAS = "0.00";
const FORMATO_FECHA = "dd/mm/yyyy";
const LIMA = "FFD4E157";
const AMBAR = "FFFDF1D8";
const ROJO = "FFFBE3E3";

/** Minutos → horas decimales, sin redondear (el redondeo es solo de formato). */
const horas = (min: number) => min / 60;

/** "2026-09-14" → fecha de Excel. Va en UTC: así ExcelJS no la corre un día. */
function fechaExcel(dia: string): Date {
  const [y, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function titulo(hoja: ExcelJS.Worksheet, texto: string, sub: string, ancho: number) {
  hoja.addRow([texto]).font = { bold: true, size: 14 };
  hoja.addRow([sub]).font = { italic: true, color: { argb: "FF6B7780" } };
  hoja.addRow([]);
  hoja.mergeCells(1, 1, 1, ancho);
  hoja.mergeCells(2, 1, 2, ancho);
}

function encabezado(hoja: ExcelJS.Worksheet, rotulos: string[]) {
  const fila = hoja.addRow(rotulos);
  fila.font = { bold: true };
  fila.alignment = { vertical: "middle", wrapText: true };
  fila.height = 30;
  fila.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIMA } };
    c.border = { bottom: { style: "thin" } };
  });
  // Al bajar por la tabla el encabezado se queda fijo.
  hoja.views = [{ state: "frozen", ySplit: fila.number }];
}

function pintar(fila: ExcelJS.Row, argb: string) {
  fila.eachCell({ includeEmpty: true }, (c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
  });
}

/** La salida quedó en un día distinto al de la entrada. */
const otroDia = (t: TurnoListado) => !!t.fin_el && diaIso(t.fin_el) !== t.dia;

/** Qué hay que saber de un turno para no leerlo mal. */
function observacion(t: TurnoListado, hoy: string): string {
  const notas: string[] = [];
  // ⚠️ Un turno sin cerrar NO es un turno de cero horas: es un dato que falta.
  // Se dice con todas las letras, porque en la columna de horas los dos casos
  // se verían iguales y se arreglan distinto.
  if (enCurso(t, hoy)) {
    // Hoy y sin salida: sigue trabajando. No es un olvido (ver `enCurso`).
    notas.push("En curso: todavía no marca la salida");
  } else if (t.fin_el === null) {
    notas.push("Sin cerrar: no suma horas hasta que se corrija");
  } else {
    // Nadie cruza la medianoche en el club: una salida de otro día casi siempre
    // es un turno que quedó abierto y se cerró después, y suma todas esas horas.
    if (otroDia(t)) notas.push("La salida es de otro día: revisar si se le olvidó cerrar");
    if (t.minutos !== null && t.minutos > SIN_ALMUERZO_DESDE_MIN && t.n_pausas === 0)
      notas.push("Sin almuerzo marcado: se está pagando la hora de comida");
  }
  if (t.ajuste_motivo) notas.push(`Corregido a mano: «${t.ajuste_motivo}»`);
  return notas.join(" · ");
}

const PUERTA: Record<TurnoListado["origen"], string> = {
  app: "Con su usuario",
  quiosco: "Quiósco de recepción",
  ajuste: "Corregido a mano",
};

export async function excelHoras(d: DatosExcelHoras): Promise<Buffer> {
  const hoy = d.hoy ?? hoyTurnos();
  const libro = new ExcelJS.Workbook();
  libro.creator = "Centro de Control CDAF";
  libro.created = new Date();

  const nombre = new Map(d.personas.map((p) => [p.id, p.nombre ?? "—"]));
  const horasDe = new Map<string, TurnoHoras[]>();
  for (const h of d.horas) {
    const l = horasDe.get(h.perfil_id);
    if (l) l.push(h);
    else horasDe.set(h.perfil_id, [h]);
  }
  const nTurnos = new Map<string, number>();
  for (const t of d.turnos) nTurnos.set(t.perfil_id, (nTurnos.get(t.perfil_id) ?? 0) + 1);

  // ── Pestaña 1: Resumen ────────────────────────────────────────────────────
  // 💡 Sin fila de total general, igual que la pantalla (decisión de Laura,
  // ago-2026): el total que importa es el de cada persona.
  const resumen = libro.addWorksheet("Resumen");
  const rotulosResumen = [
    "Empleado",
    "Rol",
    "Turnos",
    ...COLUMNAS.map((c) => (c.recargo ? `${c.rotulo} (${c.recargo})` : c.rotulo)),
    "Total horas",
  ];
  titulo(resumen, "Horas del personal", d.rotulo, rotulosResumen.length);
  encabezado(resumen, rotulosResumen);
  resumen.columns = [
    { width: 30 },
    { width: 24 },
    { width: 9 },
    ...COLUMNAS.map(() => ({ width: 13, style: { numFmt: FORMATO_HORAS } })),
    { width: 13, style: { numFmt: FORMATO_HORAS } },
  ];

  const personas = [...d.personas].sort((a, b) => (a.nombre ?? "").localeCompare(b.nombre ?? ""));
  for (const p of personas) {
    const t = sumar(horasDe.get(p.id) ?? []);
    const fila = resumen.addRow([
      p.nombre ?? "—",
      ROLE_LABEL[p.role],
      nTurnos.get(p.id) ?? 0,
      ...COLUMNAS.map((c) => horas(valorColumna(t, c))),
      horas(t.total),
    ]);
    fila.getCell(rotulosResumen.length).font = { bold: true };
    if (minutosExtra(t) > 0) pintar(fila, AMBAR);
  }

  resumen.addRow([]);
  resumen.addRow([
    "Horas en decimales: 7,5 = 7 h 30 min. Nocturnas desde las 7 p. m. · extras al pasar de 7 h " +
      "en el día, de 42 en la semana o después de las 9 p. m. · domingos y festivos llevan recargo " +
      "dominical. Un turno sin cerrar aporta cero horas: ver la pestaña «Turnos».",
  ]).font = { italic: true, size: 9, color: { argb: "FF6B7780" } };

  // ── Pestaña 2: Turnos ─────────────────────────────────────────────────────
  const hoja = libro.addWorksheet("Turnos");
  const rotulosTurnos = [
    "Empleado",
    "Fecha",
    "Día",
    "Entrada",
    "Salida a almorzar",
    "Regreso",
    "Salida",
    "Almuerzo (horas)",
    "Horas trabajadas",
    "Cómo marcó",
    "Observación",
  ];
  titulo(hoja, "Turnos del personal", d.rotulo, rotulosTurnos.length);
  encabezado(hoja, rotulosTurnos);
  hoja.columns = [
    { width: 30 },
    { width: 12, style: { numFmt: FORMATO_FECHA } },
    { width: 13 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 11, style: { numFmt: FORMATO_HORAS } },
    { width: 11, style: { numFmt: FORMATO_HORAS } },
    { width: 21 },
    { width: 55 },
  ];

  const turnos = [...d.turnos].sort(
    (a, b) =>
      (nombre.get(a.perfil_id) ?? "").localeCompare(nombre.get(b.perfil_id) ?? "") ||
      a.inicio_el.localeCompare(b.inicio_el),
  );
  for (const t of turnos) {
    const p = d.pausas.get(t.id);
    const nota = observacion(t, hoy);
    const fila = hoja.addRow([
      nombre.get(t.perfil_id) ?? "—",
      fechaExcel(t.dia),
      diaCorto(t.dia),
      horaCorta(t.inicio_el),
      p ? horaCorta(p.inicio) : "",
      p?.fin ? horaCorta(p.fin) : "",
      !t.fin_el
        ? enCurso(t, hoy)
          ? "en curso"
          : "sin marcar"
        : otroDia(t)
          ? `${horaCorta(t.fin_el)} (${diaCorto(diaIso(t.fin_el))})`
          : horaCorta(t.fin_el),
      t.n_pausas > 0 ? horas(t.minutos_pausa) : null,
      // Abierto = celda VACÍA, no 0: el dato falta, no vale cero.
      t.minutos === null ? null : horas(t.minutos),
      PUERTA[t.origen],
      nota,
    ]);
    fila.getCell(11).alignment = { wrapText: true, vertical: "top" };
    if (nota.startsWith("Sin cerrar")) pintar(fila, ROJO);
    // "En curso" y "Corregido a mano" solo informan; el ámbar es para revisar.
    else if (/Sin almuerzo|otro día/.test(nota)) pintar(fila, AMBAR);
  }
  if (turnos.length === 0) hoja.addRow(["No hay turnos en este periodo."]);

  return Buffer.from(await libro.xlsx.writeBuffer());
}
