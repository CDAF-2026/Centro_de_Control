import { createClient } from "@/lib/supabase/server";
import { valorPaquete } from "@/lib/finanzas";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const TIPO_LABEL: Record<string, string> = {
  por_clase: "Por clase",
  fijo_comision: "Fijo + comisión",
  fisico: "Físico",
};

export type LineaLiq = {
  claseId: number;
  fecha: string;
  hora: string | null;
  tipo: "individual" | "academia";
  detalle: string;
  base: string;
  valorFacturado: number;
  alumnos: number | null;
  valorProfesor: number;
};

export type LiqProfesor = {
  id: string;
  nombre: string;
  tipoLabel: string;
  clases: number;
  variable: number;
  fijo: number;
  comision: number;
  total: number;
  lineas: LineaLiq[];
};

/**
 * Liquidación por profesor en un periodo. Solo clases REALIZADAS.
 *   - particular / paquete → % × valor facturado (facturado = precio, o precio paquete ÷ nº clases)
 *   - academia            → alumnos presentes × valor por alumno del profesor
 *   - físico (tipo de comp) → asistentes presentes × pago por asistencia
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

  // Valor por clase de cada paquete (precio final ÷ nº clases).
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

  // Nombres para el detalle.
  const cliIds = [...new Set(clases.filter((c) => c.tipo === "individual").map((c) => c.cliente_id).filter((x): x is number => x != null))];
  const acaIds = [...new Set(clases.filter((c) => c.tipo === "academia").map((c) => c.academia_id).filter((x): x is number => x != null))];
  const cliName = new Map<number, string>();
  if (cliIds.length) {
    const { data } = await supabase.from("clientes").select("id, nombres, apellidos").in("id", cliIds);
    for (const c of data ?? []) cliName.set(c.id, `${c.apellidos}, ${c.nombres}`);
  }
  const acaName = new Map<number, string>();
  if (acaIds.length) {
    const { data } = await supabase.from("academias").select("id, nombre").in("id", acaIds);
    for (const a of data ?? []) acaName.set(a.id, a.nombre);
  }

  const porProf = new Map<string, LiqProfesor>();
  for (const p of profesores ?? []) {
    const comp = compById.get(p.id);
    porProf.set(p.id, {
      id: p.id,
      nombre: p.nombre ?? "—",
      tipoLabel: comp ? TIPO_LABEL[comp.tipo] ?? comp.tipo : "Sin configurar",
      clases: 0,
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
    const pct = comp ? Number(comp.pct_clase) : 0;
    const alumnos = presentes.get(c.id) ?? 0;

    let valorFacturado = 0;
    let valorProfesor = 0;
    let detalle = "";
    let base = "";
    let alum: number | null = null;

    if (comp?.tipo === "fisico") {
      alum = alumnos;
      valorProfesor = alumnos * comp.pago_asistencia;
      detalle = c.tipo === "academia" ? acaName.get(c.academia_id ?? 0) ?? "Academia" : c.cliente_id ? cliName.get(c.cliente_id) ?? "—" : "Físico";
      base = `${alumnos} asist. × ${COP.format(comp.pago_asistencia)}`;
    } else if (c.tipo === "academia") {
      alum = alumnos;
      const tarifa = comp?.valor_alumno_academia ?? 0;
      valorProfesor = alumnos * tarifa;
      detalle = acaName.get(c.academia_id ?? 0) ?? "Academia";
      base = `${alumnos} alum. × ${COP.format(tarifa)}`;
    } else {
      const facturado =
        c.valor_facturado != null
          ? c.valor_facturado
          : c.paquete_cliente_id
            ? valorClasePq.get(c.paquete_cliente_id) ?? 0
            : c.precio ?? 0;
      valorFacturado = facturado;
      valorProfesor = Math.round((facturado * pct) / 100);
      detalle = c.cliente_id ? cliName.get(c.cliente_id) ?? "—" : "Particular";
      base = `${COP.format(facturado)} × ${pct}%`;
    }

    fila.clases += 1;
    fila.variable += valorProfesor;
    fila.lineas.push({
      claseId: c.id,
      fecha: c.fecha,
      hora: c.hora_inicio,
      tipo: c.tipo,
      detalle,
      base,
      valorFacturado,
      alumnos: alum,
      valorProfesor,
    });
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
