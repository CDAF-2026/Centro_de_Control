import { createClient } from "@/lib/supabase/server";
import { valorPaquete } from "@/lib/finanzas";
import type { ReglaConcepto, ReglaEscalon, ReglaMetodo } from "@/lib/database.types";

const TIPO_LABEL: Record<string, string> = {
  por_clase: "Por clase",
  fijo_comision: "Fijo + comisión",
  fisico: "Físico",
};

export type LineaLiq = {
  claseId: number;
  fecha: string;
  hora: string | null;
  tipoLabel: string; // Particular / Paquete / Academia / Evento — o el nombre de la regla
  detalle: string; // cliente, academia o evento
  valorFacturado: number; // cobrado al cliente (o base de Siigo en alto rendimiento)
  valorProfesor: number; // a pagar al profesor
};

export type LiqProfesor = {
  id: string;
  nombre: string;
  compLabel: string; // tipo de compensación
  clases: number;
  facturado: number; // total cobrado a clientes (solo clases)
  variable: number; // pago por clases
  fijo: number; // salario fijo (modelo viejo)
  comision: number; // comisión quincenal (modelo viejo "físico")
  siigo: number; // pago por % de facturación Siigo (reglas alto rendimiento)
  eventos: number; // pago por eventos (torneos/clínicas/masterclass), aparte de clases
  total: number; // total a liquidar
  lineas: LineaLiq[];
};

/** El escalón aplicable: desde `min` asistentes se cobra `valor`; toma el mayor `min` ≤ n. */
function valorEscalon(escalones: ReglaEscalon[] | null, n: number): number {
  if (!escalones?.length) return 0;
  let valor = 0;
  for (const e of [...escalones].sort((a, b) => a.min - b.min)) {
    if (n >= e.min) valor = e.valor;
  }
  return valor;
}

/** Concepto (tipo de trabajo) de una clase, para casar con la regla del profesor. */
function conceptoDeClase(c: { tipo: string; paquete_cliente_id: number | null }): ReglaConcepto {
  if (c.tipo === "academia") return "academia";
  if (c.paquete_cliente_id) return "paquete";
  return "clase_particular";
}

type ReglaRow = {
  id: number;
  nombre: string;
  concepto: ReglaConcepto;
  metodo: ReglaMetodo;
  pct: number;
  valor: number;
  servicio_id: number | null;
  escalones: ReglaEscalon[] | null;
  dias: number[] | null;
  hora_desde: string | null;
  hora_hasta: string | null;
  umbral: number | null;
  activo: boolean;
};

const METODOS_CLASE: ReglaMetodo[] = ["pct_facturado", "fijo_por_clase", "escalonado_asistentes", "por_alumno", "comision_umbral"];

/**
 * ¿La regla (de clase) aplica a esta clase? Casa por concepto (o comodín `clase`)
 * y, si tiene filtro, por día de la semana y por hora de inicio (rango [desde, hasta)).
 */
function reglaClaseAplica(
  r: ReglaRow,
  concepto: ReglaConcepto,
  weekday: number,
  horaInicio: string | null,
): boolean {
  if (!METODOS_CLASE.includes(r.metodo)) return false;
  if (r.concepto !== concepto && r.concepto !== "clase") return false;
  if (r.dias && r.dias.length > 0 && !r.dias.includes(weekday)) return false;
  if (r.hora_desde || r.hora_hasta) {
    if (!horaInicio) return false;
    const h = horaInicio.slice(0, 8);
    if (r.hora_desde && h < r.hora_desde.slice(0, 8)) return false;
    if (r.hora_hasta && h >= r.hora_hasta.slice(0, 8)) return false;
  }
  return true;
}

/** Pago de una clase según la regla (los métodos de Siigo se resuelven aparte). */
function pagoReglaClase(
  r: ReglaRow,
  ctx: { valorFacturado: number; alumnos: number; nPersonas: number; monthRank: number | null },
): number {
  switch (r.metodo) {
    case "pct_facturado":
      return Math.round((ctx.valorFacturado * Number(r.pct)) / 100);
    case "fijo_por_clase":
      return r.valor;
    case "por_alumno":
      return ctx.alumnos * r.valor;
    case "escalonado_asistentes":
      return valorEscalon(r.escalones, ctx.nPersonas);
    case "comision_umbral":
      // El fijo cubre las primeras `umbral` clases del mes; desde la (umbral+1) paga pct%.
      return ctx.monthRank != null && r.umbral != null && ctx.monthRank > r.umbral
        ? Math.round((ctx.valorFacturado * Number(r.pct)) / 100)
        : 0;
    default:
      return 0; // pct_siigo_servicio no depende de la clase
  }
}

/**
 * Liquidación por profesor en un periodo. Solo clases REALIZADAS.
 *
 * Convivencia de modelos:
 *   - Profesor CON reglas (`profesor_regla`) → se liquida por reglas (una por concepto):
 *     clase_particular / paquete / academia salen de las clases cerradas; el concepto
 *     `siigo` (alto rendimiento) = % de lo facturado en Siigo del servicio en el periodo.
 *   - Profesor SIN reglas → modelo viejo (`profesor_compensacion`), INTACTO:
 *     particular/paquete = % × facturado; academia = alumnos × tarifa; físico = asistentes × pago;
 *     + salario fijo / comisión quincenal prorrateados por `quincenas`.
 * Los eventos se pagan igual en ambos modelos (evento_profesores.pago).
 */
export async function calcularLiquidacion(desde: string, hasta: string, quincenas: number): Promise<LiqProfesor[]> {
  const supabase = await createClient();

  const [{ data: profesores }, { data: comps }, { data: reglasRaw }, { data: clasesRaw }] = await Promise.all([
    supabase.from("profiles").select("id, nombre").eq("role", "profesor").order("nombre"),
    supabase.from("profesor_compensacion").select("*"),
    supabase
      .from("profesor_regla")
      .select("id, profesor_id, nombre, concepto, metodo, pct, valor, servicio_id, escalones, dias, hora_desde, hora_hasta, umbral, activo, orden")
      .eq("activo", true)
      .order("orden"),
    supabase
      .from("clases")
      .select("id, profesor_id, tipo, paquete_cliente_id, cliente_id, miembro_id, academia_id, fecha, hora_inicio, precio, valor_facturado, num_asistentes")
      .eq("estado", "realizada")
      .gte("fecha", desde)
      .lte("fecha", hasta),
  ]);

  const compById = new Map((comps ?? []).map((c) => [c.profesor_id, c]));
  const reglasByProf = new Map<string, ReglaRow[]>();
  for (const r of reglasRaw ?? []) {
    const arr = reglasByProf.get(r.profesor_id) ?? [];
    arr.push(r as ReglaRow);
    reglasByProf.set(r.profesor_id, arr);
  }
  const clases = clasesRaw ?? [];

  // Ranking mensual de clases para reglas de tope (comision_umbral): cuenta TODAS las
  // clases realizadas del profesor desde el 1° del mes hasta `hasta` (acumulado del mes,
  // no por quincena), para saber cuál es la clase nº 1, 2, … N del mes.
  const rangoMes = new Map<number, number>(); // claseId → nº de clase del mes (1..N)
  const umbralProfIds = [...reglasByProf.entries()]
    .filter(([, rs]) => rs.some((r) => r.metodo === "comision_umbral"))
    .map(([pid]) => pid);
  if (umbralProfIds.length) {
    const mesDesde = `${desde.slice(0, 7)}-01`;
    const { data: mesClases } = await supabase
      .from("clases")
      .select("id, profesor_id, fecha, hora_inicio")
      .eq("estado", "realizada")
      .in("profesor_id", umbralProfIds)
      .gte("fecha", mesDesde)
      .lte("fecha", hasta)
      .order("fecha")
      .order("hora_inicio", { nullsFirst: true });
    const contador = new Map<string, number>();
    for (const mc of mesClases ?? []) {
      if (!mc.profesor_id) continue;
      const n = (contador.get(mc.profesor_id) ?? 0) + 1;
      contador.set(mc.profesor_id, n);
      rangoMes.set(mc.id, n);
    }
  }

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
  // Nombre del deportista (hermano) para el detalle; cae al nombre de la ficha.
  const miembroName = new Map<number, string>();
  const miembroIds = [...new Set(clases.filter((c) => c.tipo === "individual").map((c) => c.miembro_id).filter((x): x is number => x != null))];
  if (miembroIds.length) {
    const { data } = await supabase.from("cliente_miembros").select("id, nombres, apellidos").in("id", miembroIds);
    for (const m of data ?? []) miembroName.set(m.id, `${m.apellidos}, ${m.nombres}`);
  }
  const deportista = (c: { miembro_id: number | null; cliente_id: number | null }) =>
    (c.miembro_id != null ? miembroName.get(c.miembro_id) : null) ?? (c.cliente_id ? cliName.get(c.cliente_id) : null) ?? "—";
  const acaInfo = new Map<number, { nombre: string; precio: number; dias: number[] }>();
  if (acaIds.length) {
    const { data } = await supabase.from("academias").select("id, nombre, precio, dias_semana").in("id", acaIds);
    for (const a of data ?? []) acaInfo.set(a.id, { nombre: a.nombre, precio: a.precio, dias: a.dias_semana });
  }

  const porProf = new Map<string, LiqProfesor>();
  for (const p of profesores ?? []) {
    const comp = compById.get(p.id);
    const tieneReglas = (reglasByProf.get(p.id)?.length ?? 0) > 0;
    porProf.set(p.id, {
      id: p.id,
      nombre: p.nombre ?? "—",
      compLabel: tieneReglas ? "Reglas personalizadas" : comp ? TIPO_LABEL[comp.tipo] ?? comp.tipo : "Sin configurar",
      clases: 0,
      facturado: 0,
      variable: 0,
      fijo: 0,
      comision: 0,
      siigo: 0,
      eventos: 0,
      total: 0,
      lineas: [],
    });
  }

  for (const c of clases) {
    if (!c.profesor_id) continue;
    const fila = porProf.get(c.profesor_id);
    if (!fila) continue;
    const comp = compById.get(c.profesor_id);
    const reglas = reglasByProf.get(c.profesor_id) ?? [];
    const alumnos = presentes.get(c.id) ?? 0;
    // Nº de personas de la clase particular (define el escalón). Cae a los presentes, o 1.
    const nPersonas = c.num_asistentes ?? Math.max(alumnos, 1);

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
      detalle = deportista(c);
    } else {
      valorFacturado = c.valor_facturado ?? c.precio ?? 0;
      tipoLabel = "Particular";
      detalle = c.cliente_id || c.miembro_id ? deportista(c) : "Particular";
    }

    // Valor a pagar al profesor.
    let valorProfesor: number;
    if (reglas.length) {
      // Modelo nuevo: la primera regla (por orden) que aplique a esta clase.
      const concepto = conceptoDeClase(c);
      const weekday = new Date(`${c.fecha}T00:00:00`).getDay();
      const regla = reglas.find((r) => reglaClaseAplica(r, concepto, weekday, c.hora_inicio));
      const monthRank = rangoMes.get(c.id) ?? null;
      valorProfesor = regla ? pagoReglaClase(regla, { valorFacturado, alumnos, nPersonas, monthRank }) : 0;
      if (regla) {
        tipoLabel = regla.nombre; // etiqueta exacta ("Academia Recreativa Pádel", "Comisión 7 a.m."…)
        if (regla.metodo === "comision_umbral" && monthRank != null) {
          detalle = `${detalle} · clase #${monthRank} del mes`;
        }
      }
    } else if (comp?.tipo === "fisico") {
      valorProfesor = alumnos * comp.pago_asistencia;
    } else if (c.tipo === "academia") {
      valorProfesor = alumnos * (comp?.valor_alumno_academia ?? 0);
    } else {
      valorProfesor = Math.round((valorFacturado * (comp ? Number(comp.pct_clase) : 0)) / 100);
    }

    fila.clases += 1;
    fila.facturado += valorFacturado;
    fila.variable += valorProfesor;
    fila.lineas.push({ claseId: c.id, fecha: c.fecha, hora: c.hora_inicio, tipoLabel, detalle, valorFacturado, valorProfesor });
  }

  // ───────── Reglas de Siigo (alto rendimiento): % de lo facturado en el periodo ─────────
  const siigoReglas = [...reglasByProf].flatMap(([pid, rs]) =>
    rs.filter((r) => r.metodo === "pct_siigo_servicio").map((r) => ({ pid, r })),
  );
  if (siigoReglas.length) {
    const { data: ingreso } = await supabase.rpc("siigo_ingreso_servicio", { p_desde: desde, p_hasta: hasta });
    const montoServ = new Map<number, number>((ingreso ?? []).map((x) => [x.servicio_id, Number(x.monto)]));
    for (const { pid, r } of siigoReglas) {
      const fila = porProf.get(pid);
      if (!fila) continue;
      const base = r.servicio_id != null ? montoServ.get(r.servicio_id) ?? 0 : 0;
      const pago = Math.round((base * Number(r.pct)) / 100);
      fila.siigo += pago;
      fila.lineas.push({
        claseId: -r.id, // negativo: no choca con ids de clases
        fecha: hasta,
        hora: null,
        tipoLabel: r.nombre,
        detalle: `${Number(r.pct)}% de lo facturado en Siigo`,
        valorFacturado: base,
        valorProfesor: pago,
      });
    }
  }

  // ───────── Eventos del periodo (pago a profesores, aparte de las clases) ─────────
  const { data: eventosPeriodo } = await supabase
    .from("eventos")
    .select("id, nombre, fecha_inicio")
    .gte("fecha_inicio", desde)
    .lte("fecha_inicio", hasta);
  const evInfo = new Map((eventosPeriodo ?? []).map((e) => [e.id, e]));
  const evIds = (eventosPeriodo ?? []).map((e) => e.id);
  if (evIds.length) {
    const { data: evProfs } = await supabase
      .from("evento_profesores")
      .select("id, profesor_id, pago, evento_id")
      .in("evento_id", evIds);
    for (const ep of evProfs ?? []) {
      const fila = porProf.get(ep.profesor_id);
      if (!fila) continue;
      const ev = evInfo.get(ep.evento_id);
      fila.eventos += ep.pago ?? 0;
      fila.lineas.push({
        claseId: ep.id,
        fecha: ev?.fecha_inicio ?? desde,
        hora: null,
        tipoLabel: "Evento",
        detalle: ev?.nombre ?? "Evento",
        valorFacturado: 0,
        valorProfesor: ep.pago ?? 0,
      });
    }
  }

  for (const fila of porProf.values()) {
    const reglas = reglasByProf.get(fila.id) ?? [];
    if (reglas.length) {
      // Salario fijo (regla): `valor` es MENSUAL → se prorratea por quincena (mes = 2 quincenas).
      const salMensual = reglas.filter((r) => r.metodo === "salario_fijo").reduce((s, r) => s + r.valor, 0);
      if (salMensual > 0) fila.fijo += Math.round((salMensual * quincenas) / 2);
    } else {
      // Modelo viejo (los profes con reglas no lo usan).
      const comp = compById.get(fila.id);
      if (comp?.tipo === "fijo_comision") fila.fijo = comp.salario_fijo * quincenas;
      if (comp?.tipo === "fisico") fila.comision = comp.comision_quincenal * quincenas;
    }
    fila.total = fila.variable + fila.fijo + fila.comision + fila.siigo + fila.eventos;
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
