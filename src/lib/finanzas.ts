/**
 * Cálculos financieros compartidos (ficha de cliente + dashboard).
 * Fuente única de verdad para que los saldos coincidan en toda la app.
 */

/** Meses corridos desde una fecha (incluye el mes inicial y el actual); mínimo 1. */
export function mesesCorridos(desde: string): number {
  const d = new Date(`${desde}T00:00:00`);
  const now = new Date();
  const m = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth()) + 1;
  return Math.max(1, m);
}

/** Valor de un paquete asignado = precio final del catálogo (con su descuento)
 *  menos el descuento de la asignación. */
export function valorPaquete(
  catalogoPrecio: number,
  catalogoDescPct: number,
  asignacionDescPct: number,
): number {
  const base = Math.round((catalogoPrecio || 0) * (1 - (catalogoDescPct || 0) / 100));
  return Math.round(base * (1 - (asignacionDescPct || 0) / 100));
}

/** Valor esperado de una academia a hoy: mensualidad×meses + matrícula×trimestres
 *  (matrícula fija sin descuento; el % solo afecta la mensualidad). */
export function esperadoAcademia(
  precio: number,
  matricula: number,
  inscDescPct: number,
  fechaInscripcion: string,
): number {
  const mensualidad = Math.round((precio || 0) * (1 - (inscDescPct || 0) / 100));
  const meses = mesesCorridos(fechaInscripcion);
  const trimestres = Math.ceil(meses / 3);
  return mensualidad * meses + (matricula || 0) * trimestres;
}

export type AcademiaCargo = { academiaId: number; sesiones: number; cargo: number };
export type MatriculaCargo = { deporte: string; matricula: number; semestres: number; cargo: number };
export type EsperadoAcademias = { porAcademia: AcademiaCargo[]; matriculas: MatriculaCargo[]; total: number };

/**
 * Cobro de academias de un cliente (situación financiera):
 *   - por academia: (mensualidad ÷ (días/sem del grupo × 4)) × sesiones cobrables.
 *     Las sesiones cobrables (clases cerradas sin excusa médica) las cuenta quien llama.
 *   - matrícula: UNA por deporte, semestral (cada 6 meses), según la inscripción más antigua.
 * Soporta un cliente en varios grupos: no duplica matrícula y cobra solo lo asistido.
 */
export function esperadoAcademiasCliente(
  inscripciones: { academia_id: number; descuento_pct: number; plan_frecuencia: number; fecha_inscripcion: string }[],
  academias: Map<number, { precio: number; matricula: number; deporte: string; dias_semana: number[] }>,
  sesionesPorAcademia: Map<number, number>,
): EsperadoAcademias {
  const porAcademia: AcademiaCargo[] = [];
  const matriculaPorDeporte = new Map<string, { matricula: number; fecha: string }>();

  for (const insc of inscripciones) {
    const aca = academias.get(insc.academia_id);
    if (!aca) continue;
    const diasGrupo = aca.dias_semana.length > 0 ? aca.dias_semana.length : Math.max(1, insc.plan_frecuencia);
    const mensualidad = aca.precio * (1 - (insc.descuento_pct || 0) / 100);
    const valorClase = diasGrupo > 0 ? mensualidad / (diasGrupo * 4) : 0;
    const sesiones = sesionesPorAcademia.get(insc.academia_id) ?? 0;
    porAcademia.push({ academiaId: insc.academia_id, sesiones, cargo: Math.round(valorClase * sesiones) });

    const prev = matriculaPorDeporte.get(aca.deporte);
    if (!prev || insc.fecha_inscripcion < prev.fecha) {
      matriculaPorDeporte.set(aca.deporte, { matricula: aca.matricula, fecha: insc.fecha_inscripcion });
    }
  }

  const matriculas: MatriculaCargo[] = [];
  for (const [deporte, { matricula, fecha }] of matriculaPorDeporte) {
    const semestres = Math.ceil(mesesCorridos(fecha) / 6);
    matriculas.push({ deporte, matricula, semestres, cargo: matricula * semestres });
  }

  const total = porAcademia.reduce((s, a) => s + a.cargo, 0) + matriculas.reduce((s, m) => s + m.cargo, 0);
  return { porAcademia, matriculas, total };
}

/** Imputabilidad de un pago a un servicio que genera saldo (academia/paquete). */
export function clasificarServicioPago(servicio: string): "academia" | "paquete" | "otro" {
  const s = servicio.toLowerCase();
  if (s.startsWith("academia")) return "academia";
  if (s.startsWith("paquete")) return "paquete";
  return "otro";
}

export type FamiliaIngreso =
  | "Academias"
  | "Paquetes"
  | "Clases particulares"
  | "Cafetería"
  | "Alquileres"
  | "Torneo"
  | "Otros";

export const FAMILIAS_INGRESO: FamiliaIngreso[] = [
  "Academias",
  "Paquetes",
  "Clases particulares",
  "Cafetería",
  "Alquileres",
  "Torneo",
  "Otros",
];

/** Familia de ingreso (para gráficos) según la etiqueta de servicio del pago. */
export function familiaIngreso(servicio: string | null | undefined): FamiliaIngreso {
  const s = (servicio ?? "").toLowerCase();
  if (s.startsWith("academia")) return "Academias";
  if (s.startsWith("paquete")) return "Paquetes";
  if (s.includes("clase particular")) return "Clases particulares";
  if (s.includes("cafeter")) return "Cafetería";
  if (s.includes("alquiler")) return "Alquileres";
  if (s.includes("torneo")) return "Torneo";
  return "Otros";
}

/** Familia de ingreso a partir del centro de costos (fallback cuando el pago
 *  no tiene asignación de servicio granular, p. ej. pagos demo). */
export function familiaDeCentro(centro: string): FamiliaIngreso {
  switch (centro) {
    case "clase_particular":
      return "Clases particulares";
    case "cafeteria":
      return "Cafetería";
    case "academia_tenis":
    case "academia_padel":
      return "Academias";
    default:
      return "Otros";
  }
}

/** Colores de marca por familia de ingreso (tokens --chart + extras). */
export const COLOR_FAMILIA: Record<FamiliaIngreso, string> = {
  Academias: "#37474f",
  Paquetes: "#d4e157",
  "Clases particulares": "#3e6280",
  Cafetería: "#f2b53d",
  Alquileres: "#8aa0a8",
  Torneo: "#b591e0",
  Otros: "#c8ccc4",
};
