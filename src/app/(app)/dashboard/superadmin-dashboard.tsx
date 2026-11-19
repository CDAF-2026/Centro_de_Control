import Link from "next/link";
import { TriangleAlert, Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PLAZO_CIERRE_HORAS, cierreVencido } from "@/lib/fecha";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { clasesSemanaPorProfesor } from "@/lib/easycancha";
import { ocupacionCanchas } from "@/lib/easycancha/ocupacion";
import { rangoPeriodo, isoDia, hoyBogota, type Periodo } from "@/lib/periodo";
import { PeriodoToggle } from "./periodo-toggle";
import { CountUp } from "./count-up";
import { Chispa, Delta, Panel, PanelCobro, PanelComparativo, PanelReloj, PanelSemana, PanelServicios } from "./tablero-paneles";
import {
  TABLERO,
  M,
  corto,
  colorDeServicio,
  variacion,
  type DatoServicio,
  type DiaSemana,
  type LadoComparativo,
  type Movimiento,
  type RelojCanchas,
  type SerieDiaria,
} from "./tablero-formato";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

/** Entrada escalonada de secciones (marcador que se enciende por partes). */
const ENTRAR = "animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500";
const retraso = (i: number) => ({ animationDelay: `${i * 80}ms` });

/**
 * El dashboard del superadministrador (rediseño de nov-2026, gráficas con ECharts).
 *
 * Este archivo hace DOS cosas y conviene no mezclarlas: arriba calcula todas las cifras
 * (en la base, por RPC) y abajo solo les da forma y las pinta. Las gráficas viven en
 * `tablero-paneles.tsx`; aquí no hay ninguna opción de ECharts.
 */
export async function SuperadminDashboard({
  periodo,
  nombre,
  desde,
  hasta,
  ahora: now,
}: {
  periodo: Periodo;
  nombre: string;
  desde?: string;
  hasta?: string;
  ahora: Date;
}) {
  const supabase = await createClient();
  // El día se cuenta en Colombia, no en el servidor (UTC): ver `hoyBogota`.
  const hoy = hoyBogota(now);
  const { curStartIso, curEndIso, todayIso, prevStartIso, prevEndIso } = rangoPeriodo(periodo, now, desde, hasta);
  const semanaECPromise = clasesSemanaPorProfesor(now); // EasyCancha en paralelo (cache 10 min)
  const ocupacionPromise = ocupacionCanchas(now); // idem: ocupación de canchas de la semana
  const hace6Iso = isoDia(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 6));

  // OJO: todas las sumas se hacen en la BASE (RPCs). Traer facturas fila a fila
  // y sumarlas aquí trunca en 1000 filas (tope de PostgREST) y daña las cifras.
  const [
    recaudoRes,
    recaudoPrevRes,
    diarioRes,
    dias7Res,
    dias7DetRes,
    topCliRes,
    carteraRes,
    deudaSinClienteRes,
    topPendRes,
    serviciosRes,
    pendRes,
    factDiarioRes,
    factDiarioPrevRes,
    factServicioRes,
    factServicioPrevRes,
    evResRes,
    evResPrevRes,
    evRetenidoRes,
    evRes7Res,
    antiguedadRes,
  ] = await Promise.all([
    // `p_excluir_eventos: true` saca las facturas atadas a un evento de TODA la lectura de
    // ingresos: un torneo no aporta su bruto sino su utilidad (ver más abajo), y solo cuando
    // está cerrado. Ojo: el default es false, así que /ingresos, /cartera y la
    // liquidación siguen viendo el 100% y cuadrando con Siigo.
    supabase.rpc("siigo_recaudo", { p_desde: curStartIso, p_hasta: curEndIso, p_excluir_eventos: true }),
    supabase.rpc("siigo_recaudo", { p_desde: prevStartIso, p_hasta: prevEndIso, p_excluir_eventos: true }),
    supabase.rpc("siigo_ingreso_diario", { p_desde: curStartIso, p_hasta: curEndIso, p_excluir_eventos: true }),
    supabase.rpc("siigo_ingreso_diario", { p_desde: hace6Iso, p_hasta: todayIso, p_excluir_eventos: true }),
    supabase.rpc("siigo_ingreso_dia_servicio", { p_desde: hace6Iso, p_hasta: todayIso }),
    supabase.rpc("siigo_top_clientes", { p_desde: curStartIso, p_hasta: curEndIso, p_limite: 5 }),
    supabase.rpc("siigo_cartera"),
    supabase.from("siigo_facturas").select("saldo").gt("saldo", 0).is("cliente_id", null),
    supabase
      .from("siigo_facturas")
      .select("id, numero, fecha, cliente_id, cliente_nombre_siigo, saldo")
      .gt("saldo", 0)
      .order("saldo", { ascending: false })
      .limit(5),
    supabase.from("servicios").select("id, nombre, clave"),
    supabase.from("clases").select("profesor_id, fecha, hora_inicio").eq("estado", "programada").lte("fecha", todayIso),
    // Comparativo de FACTURADO (no cobrado): periodo actual vs. el inmediatamente anterior.
    supabase.rpc("siigo_facturado_diario", { p_desde: curStartIso, p_hasta: curEndIso, p_excluir_eventos: true }),
    supabase.rpc("siigo_facturado_diario", { p_desde: prevStartIso, p_hasta: prevEndIso, p_excluir_eventos: true }),
    // Composición del ingreso y tendencias: ambas sobre lo FACTURADO (no lo cobrado).
    supabase.rpc("siigo_facturado_servicio", { p_desde: curStartIso, p_hasta: curEndIso, p_excluir_eventos: true }),
    supabase.rpc("siigo_facturado_servicio", { p_desde: prevStartIso, p_hasta: prevEndIso, p_excluir_eventos: true }),
    // Lo que los eventos SÍ aportan: la utilidad congelada de los que ya están cerrados.
    supabase.rpc("eventos_resultado_periodo", { p_desde: curStartIso, p_hasta: curEndIso }),
    supabase.rpc("eventos_resultado_periodo", { p_desde: prevStartIso, p_hasta: prevEndIso }),
    // Y lo que se está reteniendo: facturado de eventos aún sin cerrar, para avisarlo.
    supabase.rpc("eventos_retenido", { p_desde: curStartIso, p_hasta: curEndIso }),
    // Los últimos 7 días son su propia ventana (no el periodo): necesitan su propio corte.
    supabase.rpc("eventos_resultado_periodo", { p_desde: hace6Iso, p_hasta: todayIso }),
    // Cuántas facturas hay en cartera y qué tan viejas: el mismo RPC que usa /cartera,
    // para que el indicador y esa pantalla no puedan decir cosas distintas.
    supabase.rpc("siigo_cartera_antiguedad", { p_servicio: null }),
  ]);

  // ───────── Aporte neto de los eventos (torneos, clínicas…) ─────────
  // Un evento no suma su facturación bruta: suma su UTILIDAD (ingresos − gastos − pago a
  // profesores), y solo desde que se cierra. Si no, un torneo que factura 4 y cuesta 3 se
  // leería como si hubieran entrado 4. La utilidad se imputa a la fecha del evento.
  const evResultados = evResRes.data ?? [];
  const utilEventos = evResultados.reduce((s, e) => s + Number(e.utilidad), 0);
  const utilEventosPrev = (evResPrevRes.data ?? []).reduce((s, e) => s + Number(e.utilidad), 0);
  const utilEventosPorDia = new Map<string, number>();
  for (const e of evResultados) {
    utilEventosPorDia.set(e.fecha, (utilEventosPorDia.get(e.fecha) ?? 0) + Number(e.utilidad));
  }
  // Facturado de eventos ABIERTOS que cae en el periodo: lo que el dashboard aún no muestra.
  const retenido = evRetenidoRes.data?.[0] ?? { eventos: 0, facturado: 0 };
  const eventosAbiertos = Number(retenido.eventos);
  const facturadoRetenido = Number(retenido.facturado);

  // ───────── Recaudo del periodo (nivel factura, sumado en la base) ─────────
  // La utilidad del evento se suma a facturado Y a cobrado: así se preserva la identidad
  // facturado − cobrado = pendiente que hace legible el gauge (un evento cerrado es un
  // resultado ya resuelto, no una cuenta por cobrar). La deuda viva de sus facturas sigue
  // contando en la cartera total de abajo, que no filtra eventos.
  const recaudo = recaudoRes.data?.[0] ?? { facturado: 0, cobrado: 0, pendiente: 0 };
  const facturadoPeriodo = Number(recaudo.facturado) + utilEventos;
  const cobradoPeriodo = Number(recaudo.cobrado) + utilEventos;
  const saldoPeriodo = Number(recaudo.pendiente);
  const pctRecaudo = facturadoPeriodo > 0 ? (cobradoPeriodo / facturadoPeriodo) * 100 : 0;

  // ───────── Comparativo de FACTURADO: periodo actual vs. el anterior ─────────
  // Acumulado día a día, así cada curva termina exactamente en el total facturado
  // del periodo y se lee a la vez el total y el ritmo. OJO: facturado (total - NC),
  // no cobrado — es una lectura distinta a la del marcador.
  // La utilidad de cada evento cerrado entra el día del evento, para que la curva no se
  // deforme (`eventos` = utilEventosPorDia del periodo correspondiente).
  const acumularFacturado = (
    rows: { fecha: string; monto: number }[] | null,
    desdeIso: string,
    hastaIso: string,
    eventos: { fecha: string; utilidad: number }[],
  ): number[] => {
    const porDia = new Map((rows ?? []).map((r) => [r.fecha, Number(r.monto)]));
    for (const e of eventos) porDia.set(e.fecha, (porDia.get(e.fecha) ?? 0) + Number(e.utilidad));
    const out: number[] = [];
    let suma = 0;
    for (const d = new Date(`${desdeIso}T00:00:00`); ; d.setDate(d.getDate() + 1)) {
      const iso = isoDia(d);
      if (iso > hastaIso) break;
      suma += porDia.get(iso) ?? 0;
      out.push(suma);
    }
    return out;
  };
  const acumFactActual = acumularFacturado(factDiarioRes.data, curStartIso, curEndIso, evResultados);
  const acumFactPrevio = acumularFacturado(factDiarioPrevRes.data, prevStartIso, prevEndIso, evResPrevRes.data ?? []);

  const diaMesFmt = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" });
  const mesFmt = new Intl.DateTimeFormat("es-CO", { month: "long" });
  const capitaliza = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  /** "1–27 jul" si es el mismo mes; "28 jun – 27 jul" si cruza de mes. */
  const rangoCorto = (aIso: string, bIso: string) => {
    const a = new Date(`${aIso}T12:00:00`);
    const b = new Date(`${bIso}T12:00:00`);
    const mesB = diaMesFmt.format(b).replace(".", "");
    if (aIso.slice(0, 7) === bIso.slice(0, 7)) return `${a.getDate()}–${mesB}`;
    return `${diaMesFmt.format(a).replace(".", "")} – ${mesB}`;
  };
  const etiquetaPeriodo = (iso: string, fallback: string) =>
    periodo === "mes" ? capitaliza(mesFmt.format(new Date(`${iso}T12:00:00`))) : fallback;

  // El marcador del héroe usa la MISMA cifra que el gauge ("Cobrado"), para que cuadren entre sí.
  const periodTotal = cobradoPeriodo;
  const prevTotal = Number(recaudoPrevRes.data?.[0]?.cobrado ?? 0) + utilEventosPrev;

  // ───────── Composición por servicio (donut + tendencias) ─────────
  // Ambas lecturas van sobre lo FACTURADO del periodo (no lo cobrado): reflejan lo
  // que el centro vendió aunque parte siga pendiente de pago, y así el donut y las
  // tendencias hablan de la misma cifra.
  const servicioCat = new Map((serviciosRes.data ?? []).map((s) => [s.id, s]));
  /** Cubeta para los eventos cerrados que no tienen servicio asignado. */
  const CLAVE_EVENTOS = -2;
  // Cada evento cerrado entra por su servicio (normalmente "Torneos", conservando su color
  // del catálogo) con su UTILIDAD, no con su bruto. Si un evento dio pérdida y deja la
  // cubeta en negativo, el filtro de abajo la saca: no se puede dibujar una tajada negativa.
  const porServicio = (
    rows: { servicio_id: number | null; monto: number }[] | null,
    eventos: { servicio_id: number | null; utilidad: number }[],
  ) => {
    const m = new Map<number, number>();
    for (const r of rows ?? []) {
      const id = r.servicio_id ?? -1;
      m.set(id, (m.get(id) ?? 0) + Number(r.monto));
    }
    for (const e of eventos) {
      const id = e.servicio_id ?? CLAVE_EVENTOS;
      m.set(id, (m.get(id) ?? 0) + Number(e.utilidad));
    }
    return m;
  };
  const famFacturado = porServicio(factServicioRes.data, evResultados);
  const famFacturadoPrev = porServicio(factServicioPrevRes.data, evResPrevRes.data ?? []);
  const nombreFamilia = (id: number) =>
    id === CLAVE_EVENTOS ? "Eventos" : servicioCat.get(id)?.nombre ?? "Sin categoría";
  // ───────── Serie diaria + barras de la semana + marcador de hoy ─────────
  // La curva del marcador tiene que sumar exactamente `periodTotal`, así que el día de
  // cada evento cerrado lleva su utilidad además de lo cobrado del día.
  const pagadoPorDia = new Map((diarioRes.data ?? []).map((r) => [r.fecha, Number(r.monto)]));
  const serieDiaria: { fecha: string; monto: number }[] = [];
  for (let d = new Date(`${curStartIso}T00:00:00`); ; d.setDate(d.getDate() + 1)) {
    const isoD = isoDia(d);
    if (isoD > curEndIso) break;
    serieDiaria.push({ fecha: isoD, monto: (pagadoPorDia.get(isoD) ?? 0) + (utilEventosPorDia.get(isoD) ?? 0) });
  }

  const dia7Map = new Map((dias7Res.data ?? []).map((r) => [r.fecha, { monto: Number(r.monto), facturas: Number(r.facturas) }]));
  // Detalle por servicio de cada día (para el modal al clicar una barra).
  const detPorDia = new Map<string, { id: number; nombre: string; total: number }[]>();
  for (const r of dias7DetRes.data ?? []) {
    const sv = servicioCat.get(r.servicio_id ?? -1);
    const arr = detPorDia.get(r.fecha) ?? [];
    arr.push({ id: r.servicio_id ?? -1, nombre: sv?.nombre ?? "Sin categoría", total: Number(r.monto) });
    detPorDia.set(r.fecha, arr);
  }
  // Mismo tratamiento en la ventana de 7 días: la barra y su modal deben decir lo mismo.
  for (const e of evRes7Res.data ?? []) {
    const dia = dia7Map.get(e.fecha) ?? { monto: 0, facturas: 0 };
    dia7Map.set(e.fecha, { monto: dia.monto + Number(e.utilidad), facturas: dia.facturas });
    const sv = e.servicio_id != null ? servicioCat.get(e.servicio_id) : undefined;
    const arr = detPorDia.get(e.fecha) ?? [];
    arr.push({ id: e.servicio_id ?? CLAVE_EVENTOS, nombre: sv?.nombre ?? "Eventos", total: Number(e.utilidad) });
    detPorDia.set(e.fecha, arr);
  }
  const diaSemanaFmt = new Intl.DateTimeFormat("es-CO", { weekday: "short" });
  const diaLargoFmt = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long" });
  const fechaCortaFmt = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" });
  const dias7: { fecha: string; label: string; fechaLarga: string; fechaCorta: string; monto: number; facturas: number; esHoy: boolean; detalle: { id: number; nombre: string; total: number }[] }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - i);
    const isoD = isoDia(d);
    dias7.push({
      fecha: isoD,
      label: diaSemanaFmt.format(d).replace(".", ""),
      fechaLarga: diaLargoFmt.format(d),
      fechaCorta: fechaCortaFmt.format(d).replace(".", ""),
      monto: dia7Map.get(isoD)?.monto ?? 0,
      facturas: dia7Map.get(isoD)?.facturas ?? 0,
      esHoy: isoD === todayIso,
      detalle: (detPorDia.get(isoD) ?? []).filter((x) => x.total > 0).sort((a, b) => b.total - a.total),
    });
  }
  const totalSemana = dias7.reduce((s, d) => s + d.monto, 0);
  // Marcador de hoy: Siigo carga la facturación con ~1 día de rezago, así que "hoy"
  // suele quedar en $0 hasta el día siguiente. Para no mostrar un cero que parece daño,
  // si hoy aún no tiene facturas caemos al último día con facturación (último cierre).
  const hoyFacturas = dia7Map.get(todayIso)?.facturas ?? 0;
  const hoyPendiente = hoyFacturas === 0;
  const ultimoCierre = hoyPendiente ? [...dias7].reverse().find((d) => d.facturas > 0) ?? null : null;
  const marcadorMonto = hoyPendiente ? ultimoCierre?.monto ?? 0 : dia7Map.get(todayIso)?.monto ?? 0;

  // ───────── Tendencias: qué servicios suben y cuáles bajan vs. el periodo anterior ─────────
  // Sobre lo FACTURADO, igual que el donut de composición.
  const movimientos = [...new Set([...famFacturado.keys(), ...famFacturadoPrev.keys()])]
    .map((id) => {
      const actual = famFacturado.get(id) ?? 0;
      const previo = famFacturadoPrev.get(id) ?? 0;
      return {
        id,
        nombre: nombreFamilia(id),
        actual,
        delta: actual - previo,
        pct: previo > 0 ? Math.round(((actual - previo) / previo) * 100) : null,
      };
    })
    .filter((m) => m.delta !== 0);
  const enAlza = movimientos.filter((m) => m.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 4);
  const enBaja = movimientos.filter((m) => m.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 4);

  // ───────── Cartera (deuda = saldo de Siigo) ─────────
  const deudores = (carteraRes.data ?? [])
    .map((r) => ({ id: Number(r.cliente_id), debe: Number(r.saldo) }))
    .sort((a, b) => b.debe - a.debe);
  const carteraTotal = deudores.reduce((s, d) => s + d.debe, 0);
  const deudaSinCliente = (deudaSinClienteRes.data ?? []).reduce((s, r) => s + Number(r.saldo), 0);
  const topPendientes = topPendRes.data ?? [];

  // ───────── Top clientes: mayor facturación PAGADA en el periodo (agregado en la base) ─────────
  const topClientes = (topCliRes.data ?? []).map((r) => ({
    clienteId: r.cliente_id,
    nombre: r.nombre,
    pagado: Number(r.pagado),
  }));

  // ───────── Clases por cerrar ─────────
  const nowMs = now.getTime();
  let totalVencidas = 0;
  for (const c of pendRes.data ?? []) {
    if (cierreVencido(c.fecha, c.hora_inicio, nowMs)) totalVencidas++;
  }

  // ───────── Clases agendadas y ocupación de canchas de la semana (EasyCancha) ─────────
  const [semanaEC, ocupacion] = await Promise.all([semanaECPromise, ocupacionPromise]);

  // ───────── Nombres de clientes (deudores + top) ─────────
  const cliName = new Map<number, string>();
  const cliIdsNecesarios = [
    ...new Set(
      [...topPendientes.map((f) => f.cliente_id), ...topClientes.map((t) => t.clienteId)].filter(
        (x): x is number => x != null,
      ),
    ),
  ];
  if (cliIdsNecesarios.length) {
    const { data } = await supabase.from("clientes").select("id, nombres, apellidos").in("id", cliIdsNecesarios);
    for (const c of data ?? []) cliName.set(c.id, `${c.apellidos}, ${c.nombres}`);
  }

  const hrefIngresos = `/ingresos?periodo=${periodo}${periodo === "custom" && desde && hasta ? `&desde=${desde}&hasta=${hasta}` : ""}`;
  // Si el perfil no tiene nombre y llega el correo, saludar sin el dominio.
  const saludo = nombre.includes("@") ? nombre.split("@")[0] : nombre;
  const carteraGlobal = carteraTotal + deudaSinCliente;

  // ───────── Datos para las gráficas ─────────
  // Aquí solo se les da forma: todas las cifras salen de los cálculos de arriba.
  const prevFacturado = Number(recaudoPrevRes.data?.[0]?.facturado ?? 0) + utilEventosPrev;
  const cobradoVs = variacion(periodTotal, prevTotal);
  const facturadoVs = variacion(facturadoPeriodo, prevFacturado);

  const tramosCartera = antiguedadRes.data ?? [];
  const facturasCartera = tramosCartera.reduce((s, t) => s + Number(t.n), 0);
  const totalTramos = tramosCartera.reduce((s, t) => s + Number(t.total), 0);
  const reciente = Number(tramosCartera.find((t) => t.tramo === "0_30")?.total ?? 0);
  const pctReciente = totalTramos > 0 ? (reciente / totalTramos) * 100 : 100;

  // Hoy todavía sin facturas (rezago de Siigo): en las gráficas va como "sin datos", no
  // como un cero. Un cero se lee como "hoy no entró nada", que casi nunca es verdad.
  const sinDatosHoy = hoyPendiente && curEndIso === todayIso;
  const medioDia = (iso: string) => new Date(`${iso}T12:00:00`);
  const fechaCorta = (iso: string) => diaMesFmt.format(medioDia(iso)).replace(".", "");
  const serieCobro: SerieDiaria = {
    etiquetas: serieDiaria.map((s) => {
      const corta = periodo === "mes" ? String(medioDia(s.fecha).getDate()) : fechaCorta(s.fecha);
      return s.fecha === todayIso ? `${corta} · hoy` : corta;
    }),
    titulos: serieDiaria.map((s) => capitaliza(diaLargoFmt.format(medioDia(s.fecha)))),
    montos: serieDiaria.map((s) => (sinDatosHoy && s.fecha === todayIso ? null : s.monto)),
  };
  const ladoActual: LadoComparativo = {
    nombre: etiquetaPeriodo(curStartIso, "Este periodo"),
    rango: rangoCorto(curStartIso, curEndIso),
    acum: acumFactActual.map((v, i) => (sinDatosHoy && i === acumFactActual.length - 1 ? null : v)),
    // Misma ventana y mismo orden que el acumulado: un día por posición.
    marcas: serieDiaria.map((s) => fechaCorta(s.fecha)),
  };
  const ladoPrevio: LadoComparativo = {
    nombre: etiquetaPeriodo(prevStartIso, "Periodo anterior"),
    rango: rangoCorto(prevStartIso, prevEndIso),
    acum: acumFactPrevio,
  };
  // En "mes" los dos lados tienen nombre propio ("noviembre vs. octubre"); en los demás periodos no.
  const mesDe = (iso: string) => mesFmt.format(medioDia(iso));
  const tituloComparativo =
    periodo === "mes" ? `Facturado: ${mesDe(curStartIso)} vs. ${mesDe(prevStartIso)}` : "Facturado: este periodo vs. el anterior";
  const frente = periodo === "mes" ? `Frente a ${mesDe(prevStartIso)}` : "Frente al periodo anterior";

  const colorDe = (id: number) => colorDeServicio(servicioCat.get(id)?.clave);
  const serviciosTablero: DatoServicio[] = [...famFacturado.entries()]
    .map(([id, total]) => ({ id, nombre: nombreFamilia(id), color: colorDe(id), actual: total, previo: famFacturadoPrev.get(id) ?? 0 }))
    // Un evento que dio pérdida deja su cubeta en negativo: no se puede dibujar.
    .filter((s) => s.actual > 0)
    .sort((a, b) => b.actual - a.actual);
  const totalServicios = serviciosTablero.reduce((s, x) => s + x.actual, 0);
  const movimiento = (m: (typeof movimientos)[number]): Movimiento => ({
    id: m.id,
    nombre: m.nombre,
    // `pct` es null cuando el periodo anterior estaba en cero: no hay porcentaje que dar.
    texto: m.pct === null ? (m.delta > 0 ? "nuevo" : "—") : (m.delta > 0 ? "+" : "−") + Math.abs(m.pct) + "%",
  });
  // Los tres que más subieron y los tres que más bajaron EN PESOS (no en porcentaje): un
  // servicio chico que se duplica mueve menos la cifra que uno grande que sube un quinto.
  const suben = enAlza.slice(0, 3).map(movimiento);
  const bajan = enBaja.slice(0, 3).map(movimiento);

  const diasTablero: DiaSemana[] = dias7.map((d) => {
    const numero = d.fechaCorta.split(" ")[0];
    return {
      etiqueta: d.esHoy ? `hoy ${numero}` : `${d.label} ${numero}`,
      titulo: capitaliza(d.fechaLarga),
      monto: d.esHoy && hoyPendiente ? null : d.monto,
      facturas: d.facturas,
      partes: d.detalle.map((x) => ({ id: x.id, nombre: x.nombre, color: colorDe(x.id), total: x.total })),
    };
  });

  // El reloj: un día típico de ESTA semana. Se promedian solo los días que ya llegaron
  // (hoy incluido): los que faltan solo traen lo reservado por adelantado y bajarían el
  // promedio sin que el club esté más vacío.
  const media = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  const diasSemana = ocupacion.porHora.dias.map((d, i) => ({ ...d, i }));
  const diasReloj = diasSemana.some((d) => !d.futuro) ? diasSemana.filter((d) => !d.futuro) : diasSemana;
  const perfil = (matriz: number[][]) =>
    ocupacion.porHora.horas.map((_, h) => Math.round(media(diasReloj.map((d) => matriz[d.i]?.[h] ?? 0))));
  const reloj: RelojCanchas = {
    horas: ocupacion.porHora.horas,
    tenis: perfil(ocupacion.porHora.tenis),
    padel: perfil(ocupacion.porHora.padel),
  };
  // "lunes, 16 de noviembre" → "lunes".
  const nombreDia = (detalle: string) => detalle.split(/[\s,]+/)[0].toLowerCase();
  const rangoReloj =
    diasReloj.length === 0
      ? ""
      : diasReloj.length === 1
        ? ` · solo el ${nombreDia(diasReloj[0].detalle)}`
        : ` · promedio de ${nombreDia(diasReloj[0].detalle)} a ${nombreDia(diasReloj[diasReloj.length - 1].detalle)}`;

  const entrenadores = semanaEC.ranking.slice(0, 10);
  const totalClases = semanaEC.ranking.reduce((s, r) => s + r.clases, 0);
  const maxClases = Math.max(1, ...entrenadores.map((e) => e.clases));

  const sumaTopClientes = topClientes.reduce((s, t) => s + t.pagado, 0);
  const sumaTopDeudas = topPendientes.reduce((s, f) => s + Number(f.saldo), 0);
  /** "los cinco" cuando son cinco; si hay menos, el número ("los 3"). */
  const cuantos = (n: number, articulo: "los" | "las") => (n === 5 ? `${articulo} cinco` : `${articulo} ${n}`);
  const diasDesde = (iso: string) => Math.round((Date.parse(`${todayIso}T12:00:00Z`) - Date.parse(`${iso}T12:00:00Z`)) / 86_400_000);
  const hace = (n: number) => (n <= 0 ? "hoy" : n === 1 ? "ayer" : `hace ${n} días`);

  const pie = "border-border text-muted-foreground border-t pt-3 text-xs";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="cdaf-headline">Dashboard</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {rangoCorto(curStartIso, curEndIso)}, comparado con {rangoCorto(prevStartIso, prevEndIso)}
          </p>
        </div>
        <PeriodoToggle periodo={periodo} desde={desde} hasta={hasta} />
      </div>

      {/* ── Banner: el marcador de hoy (se conserva tal cual del dashboard anterior) ── */}
      <section className={ENTRAR} style={retraso(0)}>
        <div className="bg-stadium relative overflow-hidden rounded-2xl p-6 text-white shadow-md sm:p-8">
          <div className="bg-primary/15 pointer-events-none absolute -top-28 -right-16 size-80 rounded-full blur-3xl" />
          <div className="bg-primary/10 pointer-events-none absolute -bottom-32 left-1/3 size-72 rounded-full blur-3xl" />
          <div className="relative flex flex-wrap items-center justify-between gap-6">
            <div className="min-w-0">
              <p className="text-primary font-heading text-xs font-bold tracking-[0.2em] uppercase">Centro de Control</p>
              <h2 className="font-heading mt-1 text-2xl font-bold tracking-tight italic sm:text-3xl">¡Hola, {saludo}! 👋</h2>
              <p className="mt-1 text-sm text-white/70">Así va el marcador de hoy en el centro.</p>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <CountUp value={marcadorMonto} className="font-heading text-primary block text-3xl font-bold tracking-tight sm:text-4xl" />
                {hoyPendiente ? (
                  <p className="mt-0.5 text-xs font-medium text-white/90">
                    {ultimoCierre ? `Último cierre · ${ultimoCierre.label} ${ultimoCierre.fechaCorta}` : "Sin facturación reciente en Siigo"}
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-white/70">{hoyFacturas} factura(s) hoy · sync cada 20 min</p>
                )}
              </div>
              <Link href={hrefIngresos} className={cn(buttonVariants({ size: "sm" }), "shrink-0")}>
                Ver ingresos
              </Link>
            </div>
          </div>
        </div>
      </section>

      {totalVencidas > 0 && (
        <div className="border-destructive/30 bg-destructive/[0.06] flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 shadow-sm">
          <span className="flex items-center gap-2.5 text-sm">
            <TriangleAlert className="text-destructive size-5 shrink-0" />
            <span>
              <strong>{totalVencidas}</strong> clase(s) sin cerrar hace más de {PLAZO_CIERRE_HORAS} h.
            </span>
          </span>
          <Link href="/cierre/vencidas" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            Ver vencidas
          </Link>
        </div>
      )}

      {/* Transparencia: las cifras NO incluyen los eventos sin cerrar. Sin este aviso, el
          dashboard no cuadraría con Siigo y no se sabría por qué. */}
      {facturadoRetenido > 0 && (
        <div className="border-warning/40 bg-warning/10 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 shadow-sm">
          <span className="flex items-center gap-2.5 text-sm">
            <Trophy className="text-warning size-5 shrink-0" />
            <span>
              <strong className="tabular-nums">{COP.format(facturadoRetenido)}</strong> facturados en <strong>{eventosAbiertos}</strong>{" "}
              evento(s) sin cerrar todavía no entran a estas cifras. Al cerrarlos entra su <strong>utilidad</strong> (ingresos − gastos), no
              el bruto.
            </span>
          </span>
          <Link href="/eventos" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            Ver eventos
          </Link>
        </div>
      )}

      {/* ── Indicadores ── */}
      <div className={cn("grid grid-cols-2 gap-4 lg:grid-cols-4", ENTRAR)} style={retraso(1)}>
        <Kpi
          etiqueta="Facturado"
          valor={corto(facturadoPeriodo)}
          exacto={COP.format(facturadoPeriodo)}
          detalle={
            <>
              <Delta v={facturadoVs} /> vs. {corto(prevFacturado)}
            </>
          }
        >
          <Chispa valores={ladoActual.acum} forma="area" etiqueta="Facturado acumulado en el periodo" />
        </Kpi>
        <Kpi
          etiqueta="Cobrado"
          valor={corto(periodTotal)}
          exacto={COP.format(periodTotal)}
          detalle={
            <>
              <Delta v={cobradoVs} /> vs. {corto(prevTotal)}
            </>
          }
        >
          <Chispa valores={serieCobro.montos} forma="barras" etiqueta="Cobrado por día en el periodo" />
        </Kpi>
        <Kpi
          etiqueta="Por cobrar del periodo"
          valor={corto(saldoPeriodo)}
          exacto={COP.format(saldoPeriodo)}
          detalle={facturadoPeriodo > 0 ? `${Math.round((saldoPeriodo / facturadoPeriodo) * 100)}% de lo facturado` : "Sin facturación en el periodo"}
        >
          <Medidor pct={pctRecaudo} etiqueta={`${Math.round(pctRecaudo)}% de lo facturado ya está cobrado`} />
        </Kpi>
        <Kpi
          etiqueta="Cartera total"
          valor={corto(carteraGlobal)}
          exacto={COP.format(carteraGlobal)}
          detalle={`${facturasCartera} factura(s), todas las fechas`}
        >
          <Medidor pct={pctReciente} etiqueta={`${Math.round(pctReciente)}% de la cartera tiene menos de 30 días`} />
        </Kpi>
      </div>

      {/* ── Paneles ── En cada fila las dos tarjetas quedan del mismo alto: la gráfica o la
          lista de la más corta se estira (ver `minimo` en echart.tsx). */}
      <div className={cn("grid grid-cols-1 gap-4 xl:grid-cols-12", ENTRAR)} style={retraso(2)}>
        <PanelCobro
          className="xl:col-span-6"
          serie={serieCobro}
          sub={
            <>
              Dinero que ha ingresado · arrastra la barra para acercarte
              {utilEventos !== 0 && ` · incluye ${COP.format(utilEventos)} de utilidad de eventos cerrados`}
              {sinDatosHoy && " · hoy aún sin datos"}
            </>
          }
        />

        <PanelComparativo
          className="xl:col-span-6"
          titulo={tituloComparativo}
          actual={ladoActual}
          previo={ladoPrevio}
          total={facturadoPeriodo}
          totalTexto={COP.format(facturadoPeriodo)}
          totalPrevio={prevFacturado}
        />

        <PanelServicios
          className="xl:col-span-4"
          servicios={serviciosTablero}
          total={totalServicios}
          sub={`Facturado del periodo · ${M(totalServicios)}`}
          frente={frente}
          suben={suben}
          bajan={bajan}
        />

        <PanelSemana
          className="xl:col-span-8"
          dias={diasTablero}
          sub={
            <>
              Cobrado por día · {M(totalSemana)} en la semana
              {hoyPendiente && " · hoy aún sin datos"}
            </>
          }
        />

        <Panel className="xl:col-span-4" titulo="Top clientes" sub={`Los ${topClientes.length || 5} que más han pagado en el periodo`}>
          {topClientes.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">Aún no hay facturación pagada identificada en el periodo.</p>
          ) : (
            <>
              <ol className="divide-border flex flex-1 flex-col divide-y">
                {topClientes.map((t, idx) => {
                  const nombreCli = t.clienteId != null ? cliName.get(t.clienteId) ?? t.nombre ?? `Cliente #${t.clienteId}` : t.nombre ?? "—";
                  return (
                    <li key={`${t.clienteId ?? t.nombre}-${idx}`} className="flex flex-1 items-center justify-between gap-3 py-3 text-[13px]">
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="bg-primary/35 border-lime-dim text-charcoal flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold">
                          {idx + 1}
                        </span>
                        {t.clienteId != null ? (
                          <Link href={`/clientes/${t.clienteId}`} className="truncate hover:underline" title={nombreCli}>
                            {nombreCli}
                          </Link>
                        ) : (
                          <span className="truncate" title={nombreCli}>
                            {nombreCli}
                          </span>
                        )}
                      </span>
                      <strong className="shrink-0 tabular-nums">{COP.format(t.pagado)}</strong>
                    </li>
                  );
                })}
              </ol>
              <p className={pie}>
                Entre {cuantos(topClientes.length, "los")} suman <strong className="text-foreground">{M(sumaTopClientes)}</strong>
                {periodTotal > 0 && `, el ${Math.round((sumaTopClientes / periodTotal) * 100)}% de lo cobrado`}.
              </p>
            </>
          )}
        </Panel>

        <Panel
          className="xl:col-span-8"
          titulo="Top deudores"
          sub={`Las ${topPendientes.length || 5} facturas pendientes de mayor valor`}
        >
          {topPendientes.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">Cartera al día: nadie con saldo pendiente.</p>
          ) : (
            <>
              <ul className="divide-border flex flex-1 flex-col divide-y">
                {topPendientes.map((f) => (
                  <li key={f.id} className="flex flex-1 items-center justify-between gap-3 py-3 text-[13px]">
                    <span className="min-w-0 leading-tight">
                      {f.cliente_id ? (
                        <Link href={`/clientes/${f.cliente_id}`} className="block truncate hover:underline">
                          {cliName.get(f.cliente_id) ?? `Cliente #${f.cliente_id}`}
                        </Link>
                      ) : f.cliente_nombre_siigo ? (
                        <span className="block truncate">{f.cliente_nombre_siigo}</span>
                      ) : (
                        <span className="text-muted-foreground block">Sin identificar</span>
                      )}
                      <span className="text-muted-foreground block text-xs" title={f.numero ?? undefined}>
                        Factura del {fechaCorta(f.fecha)} · {hace(diasDesde(f.fecha))}
                      </span>
                    </span>
                    <strong className="text-destructive shrink-0 tabular-nums">{COP.format(f.saldo)}</strong>
                  </li>
                ))}
              </ul>
              <p className={pie}>
                Entre {cuantos(topPendientes.length, "las")} suman <strong className="text-foreground">{M(sumaTopDeudas)}</strong>
                {carteraGlobal > 0 && `, el ${Math.round((sumaTopDeudas / carteraGlobal) * 100)}% de la cartera total`} ({M(carteraGlobal)} en{" "}
                {facturasCartera} factura(s)).
              </p>
            </>
          )}
        </Panel>

        <PanelReloj
          className="xl:col-span-6"
          reloj={reloj}
          sub={`Ocupación de un día típico, hora por hora${rangoReloj}`}
        />

        <Panel className="xl:col-span-6" titulo="Clases por entrenador" sub={`Agendadas esta semana · ${totalClases} en total`}>
          {entrenadores.length === 0 ? (
            <p className="text-muted-foreground py-10 text-center text-sm">No hay clases agendadas en EasyCancha esta semana.</p>
          ) : (
            <ul className="flex flex-1 flex-col justify-between">
              {entrenadores.map((e) => {
                // El pádel en su verde y el tenis en azul, como en el reloj; quien dicta los dos va en azul.
                const soloPadel = e.deportes.length === 1 && e.deportes[0] === "padel";
                const deporte = e.deportes.map((d) => (d === "padel" ? "Pádel" : "Tenis")).join(" y ");
                return (
                  <li key={e.nombre} className="py-[7px]">
                    <div className="flex items-baseline justify-between gap-2.5 text-[13px]">
                      <span className="min-w-0 truncate">
                        {e.nombre}
                        {deporte && <span className="text-muted-foreground"> · {deporte}</span>}
                      </span>
                      <strong className="tabular-nums">{e.clases}</strong>
                    </div>
                    <div className="bg-muted mt-1.5 h-2 overflow-hidden rounded">
                      <div
                        className="h-2 rounded"
                        style={{ width: `${(e.clases / maxClases) * 100}%`, background: soloPadel ? TABLERO.padel : TABLERO.tenis }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <p className="text-muted-foreground text-xs">Dinero: Siigo, se actualiza cada 20 min · Canchas y clases: EasyCancha</p>
    </div>
  );
}

/** Un indicador: etiqueta, cifra, un renglón de contexto y, abajo, su minigráfica o medidor. */
function Kpi({
  etiqueta,
  valor,
  exacto,
  detalle,
  children,
}: {
  etiqueta: string;
  valor: string;
  /** La cifra completa, para quien pase el cursor sobre la abreviada. */
  exacto?: string;
  detalle?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-card border-border flex min-w-0 flex-col gap-1 rounded-xl border px-[18px] py-4 shadow-sm">
      <span className="text-muted-foreground text-[11px] font-bold tracking-wider uppercase">{etiqueta}</span>
      <span className="font-heading text-[26px] leading-tight font-bold tabular-nums" title={exacto}>
        {valor}
      </span>
      {detalle && <span className="text-muted-foreground text-xs">{detalle}</span>}
      {children && <div className="mt-auto pt-2.5">{children}</div>}
    </div>
  );
}

/** Barra de dos tramos: lo resuelto en grafito, lo que falta en ámbar. */
function Medidor({ pct, etiqueta }: { pct: number; etiqueta: string }) {
  const lleno = Math.max(0, Math.min(100, pct));
  return (
    <div role="img" aria-label={etiqueta} className="bg-muted flex h-2 gap-0.5 overflow-hidden rounded">
      <span className="block h-2" style={{ width: `${lleno}%`, background: TABLERO.carbon }} />
      <span className="block h-2" style={{ width: `${100 - lleno}%`, background: TABLERO.ambar }} />
    </div>
  );
}
