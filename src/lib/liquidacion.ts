import { createClient } from "@/lib/supabase/server";
import { valorPaquete } from "@/lib/finanzas";

const TIPO_LABEL: Record<string, string> = {
  por_clase: "Por clase",
  fijo_comision: "Fijo + comisión",
  fisico: "Físico",
};

export type LineaLiq = {
  claseId: number;
  fecha: string;
  hora: string | null;
  tipoLabel: string; // Particular / Paquete / Academia
  detalle: string; // cliente o academia
  valorFacturado: number; // cobrado al cliente
  valorProfesor: number; // a pagar al profesor
};

export type LiqProfesor = {
  id: string;
  nombre: string;
  compLabel: string; // tipo de compensación
  clases: number;
  facturado: number; // total cobrado a clientes
  variable: number;
  fijo: number;
  comision: number;
  total: number; // total a liquidar
  lineas: LineaLiq[];
};

/**
 * Liquidación por profesor en un periodo. Solo clases REALIZADAS.
 * Por cada clase calcula:
 *   - Valor facturado (cobrado al cliente): academia = alumnos × (mensualidad ÷ días×4);
 *     paquete = precio paquete ÷ nº clases; particular = precio de la clase.
 *   - Valor a pagar al profesor (según su compensación): particular/paquete = % × facturado;
 *     academia = alumnos × tarifa por alumno; físico = asistentes × pago.
 *   + salario fijo (fijo_comision) o comisión quincenal (físico), prorrateados por `quincenas`.
 */
export async function calcularLiquidacion(desde: string, hasta: string, quincenas: number): Promise<LiqProfesor[]> {
  const supabase = await createClient();

  const [{ data: profesores }, { data: comps }, { data: clasesRaw }] = await Promise.all([
    supabase.from("profiles").select("id, nombre").eq("role", "profesor").order("nombre"),
    supabase.from("profesor_compensacion").select("*"),
    supabase
      .from("clases")
      .select("id, profesor_id, tipo, paquete_cliente_id, cliente_id, academia_id, fecha, hora_inicio, precio, valor_facturado")
      .eq("estado", "realizada")
      .gte("fecha", desde)
      .lte("fecha", hasta),
  ]);

  const compById = new Map((comps ?? []).map((c) => [c.profesor_id, c]));
  const clases = clasesRaw ?? [];

  // Asistentes presentes por clase (academia / físico).
  const presentes = new Map<number, number>();
  const claseIds = clases.map((c) => c.id);
  if (claseIds.length) {
    const { data: asis } = await supabase.from("asistencias").select("clase_id, presente, estado").in("clase_id", claseIds);
    for (const a of asis ?? []) {
      const ok = a.estado ? a.estado === "presente" : a.presente;
      if (ok) presentes.set(a.clase_id, (presentes.get(a.clase_id) ?? 0) + 1);
    }
  }

  // Valor por clase de cada paquete.
  const valorClasePq = new Map<number, number>();
  const pqIds = [...new Set(clases.map((c) => c.paquete_cliente_id).filter((x): x is number => x != null))];
  if (pqIds.length) {
    const { data: pcs } = await supabase.from("paquetes_cliente").select("id, catalogo_id, num_clases, descuento_pct").in("id", pqIds);
    const catIds = [...new Set((pcs ?? []).map((p) => p.catalogo_id).filter((x): x is number => x != null))];
    const cats = catIds.length
      ? (await supabase.from("paquetes_catalogo").select("id, precio, descuento_pct").in("id", catIds)).data ?? []
      : [];
    const catMap = new Map(cats.map((c) => [c.id, c]));
    for (const p of pcs ?? []) {
      const cat = p.catalogo_id ? catMap.get(p.catalogo_id) : null;
      const base = cat ? valorPaquete(cat.precio, Number(cat.descuento_pct), Number(p.descuento_pct)) : 0;
      valorClasePq.set(p.id, p.num_clases > 0 ? Math.round(base / p.num_clases) : 0);
    }
  }

  // Nombres de cliente + info de academia (nombre, precio, días) para detalle y valor facturado.
  const cliIds = [...new Set(clases.filter((c) => c.tipo === "individual").map((c) => c.cliente_id).filter((x): x is number => x != null))];
  const acaIds = [...new Set(clases.filter((c) => c.tipo === "academia").map((c) => c.academia_id).filter((x): x is number => x != null))];
  const cliName = new Map<number, string>();
  if (cliIds.length) {
    const { data } = await supabase.from("clientes").select("id, nombres, apellidos").in("id", cliIds);
    for (const c of data ?? []) cliName.set(c.id, `${c.apellidos}, ${c.nombres}`);
  }
  const acaInfo = new Map<number, { nombre: string; precio: number; dias: number[] }>();
  if (acaIds.length) {
    const { data } = await supabase.from("academias").select("id, nombre, precio, dias_semana").in("id", acaIds);
    for (const a of data ?? []) acaInfo.set(a.id, { nombre: a.nombre, precio: a.precio, dias: a.dias_semana });
  }

  const porProf = new Map<string, LiqProfesor>();
  for (const p of profesores ?? []) {
    const comp = compById.get(p.id);
    porProf.set(p.id, {
      id: p.id,
      nombre: p.nombre ?? "—",
      compLabel: comp ? TIPO_LABEL[comp.tipo] ?? comp.tipo : "Sin configurar",
      clases: 0,
      facturado: 0,
      variable: 0,
      fijo: 0,
      comision: 0,
      total: 0,
      lineas: [],
    });
  }

  for (const c of clases) {
    if (!c.profesor_id) continue;
    const fila = porProf.get(c.profesor_id);
    if (!fila) continue;
    const comp = compById.get(c.profesor_id);
    const alumnos = presentes.get(c.id) ?? 0;

    // Valor cobrado al cliente.
    let valorFacturado = 0;
    let tipoLabel: string;
    let detalle: string;
    if (c.tipo === "academia") {
      const aca = c.academia_id != null ? acaInfo.get(c.academia_id) : undefined;
      const diasN = aca && aca.dias.length > 0 ? aca.dias.length : 1;
      valorFacturado = aca ? Math.round(alumnos * (aca.precio / (diasN * 4))) : 0;
      tipoLabel = "Academia";
      detalle = `${aca?.nombre ?? "Academia"} · ${alumnos} alum.`;
    } else if (c.paquete_cliente_id) {
      valorFacturado = c.valor_facturado ?? valorClasePq.get(c.paquete_cliente_id) ?? 0;
      tipoLabel = "Paquete";
      detalle = c.cliente_id ? cliName.get(c.cliente_id) ?? "—" : "—";
    } else {
      valorFacturado = c.valor_facturado ?? c.precio ?? 0;
      tipoLabel = "Particular";
      detalle = c.cliente_id ? cliName.get(c.cliente_id) ?? "—" : "Particular";
    }

    // Valor a pagar al profesor (según su compensación).
    let valorProfesor: number;
    if (comp?.tipo === "fisico") valorProfesor = alumnos * comp.pago_asistencia;
    else if (c.tipo === "academia") valorProfesor = alumnos * (comp?.valor_alumno_academia ?? 0);
    else valorProfesor = Math.round((valorFacturado * (comp ? Number(comp.pct_clase) : 0)) / 100);

    fila.clases += 1;
    fila.facturado += valorFacturado;
    fila.variable += valorProfesor;
    fila.lineas.push({ claseId: c.id, fecha: c.fecha, hora: c.hora_inicio, tipoLabel, detalle, valorFacturado, valorProfesor });
  }

  for (const fila of porProf.values()) {
    const comp = compById.get(fila.id);
    if (comp?.tipo === "fijo_comision") fila.fijo = comp.salario_fijo * quincenas;
    if (comp?.tipo === "fisico") fila.comision = comp.comision_quincenal * quincenas;
    fila.total = fila.variable + fila.fijo + fila.comision;
    fila.lineas.sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.hora ?? "").localeCompare(b.hora ?? ""));
  }

  return [...porProf.values()];
}

/** Rango de fechas a partir del periodo (q1 / q2 / mes) y el mes (YYYY-MM). */
export function rangoPeriodoLiq(periodo: string, ym: string) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const [y, m] = ym.split("-").map(Number);
  const ultimo = new Date(y, m, 0).getDate();
  if (periodo === "q1") return { desde: `${ym}-01`, hasta: `${ym}-15`, quincenas: 1 };
  if (periodo === "q2") return { desde: `${ym}-16`, hasta: `${ym}-${pad(ultimo)}`, quincenas: 1 };
  return { desde: `${ym}-01`, hasta: `${ym}-${pad(ultimo)}`, quincenas: 2 };
}
