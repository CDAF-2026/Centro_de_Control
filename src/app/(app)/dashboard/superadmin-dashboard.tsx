import Link from "next/link";
import {
  Wallet,
  Users,
  CalendarClock,
  TriangleAlert,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Trophy,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { instanteClase } from "@/lib/fecha";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { COLOR_SERVICIO_DEFAULT } from "@/lib/finanzas";
import { clasesSemanaPorProfesor } from "@/lib/easycancha";
import { ocupacionCanchas } from "@/lib/easycancha/ocupacion";
import { rangoPeriodo, isoDia, type Periodo } from "@/lib/periodo";
import { PeriodoToggle } from "./periodo-toggle";
import { CountUp } from "./count-up";
import { ChartArea } from "./chart-area";
import { ChartBarrasSemana } from "./chart-barras-semana";
import { ChartDonut } from "./chart-donut";
import { ChartComparativo } from "./chart-comparativo";
import { ChartOcupacion } from "./chart-ocupacion";
import { RadialGauge } from "./radial-gauge";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

/** Entrada escalonada de secciones (marcador que se enciende por partes). */
const ENTRAR = "animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500";
const retraso = (i: number) => ({ animationDelay: `${i * 80}ms` });

export async function SuperadminDashboard({
  periodo,
  nombre,
  desde,
  hasta,
}: {
  periodo: Periodo;
  nombre: string;
  desde?: string;
  hasta?: string;
}) {
  const supabase = await createClient();
  const now = new Date();
  const { curStartIso, curEndIso, todayIso, prevStartIso, prevEndIso } = rangoPeriodo(periodo, now, desde, hasta);
  const semanaECPromise = clasesSemanaPorProfesor(); // EasyCancha en paralelo (cache 10 min)
  const ocupacionPromise = ocupacionCanchas(); // idem: ocupación de canchas de la semana
  const hace6Iso = isoDia(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6));

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
    supabase.from("servicios").select("id, nombre, color"),
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
  const deltaPct = prevTotal > 0 ? Math.round(((periodTotal - prevTotal) / prevTotal) * 100) : null;

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
  const familiasIngreso = [...famFacturado.entries()]
    .map(([id, total]) => ({
      nombre: nombreFamilia(id),
      total,
      color: servicioCat.get(id)?.color ?? COLOR_SERVICIO_DEFAULT,
    }))
    .filter((t) => t.total > 0)
    .sort((a, b) => b.total - a.total);

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
  const detPorDia = new Map<string, { nombre: string; total: number; color: string }[]>();
  for (const r of dias7DetRes.data ?? []) {
    const sv = servicioCat.get(r.servicio_id ?? -1);
    const arr = detPorDia.get(r.fecha) ?? [];
    arr.push({ nombre: sv?.nombre ?? "Sin categoría", total: Number(r.monto), color: sv?.color ?? COLOR_SERVICIO_DEFAULT });
    detPorDia.set(r.fecha, arr);
  }
  // Mismo tratamiento en la ventana de 7 días: la barra y su modal deben decir lo mismo.
  for (const e of evRes7Res.data ?? []) {
    const dia = dia7Map.get(e.fecha) ?? { monto: 0, facturas: 0 };
    dia7Map.set(e.fecha, { monto: dia.monto + Number(e.utilidad), facturas: dia.facturas });
    const sv = e.servicio_id != null ? servicioCat.get(e.servicio_id) : undefined;
    const arr = detPorDia.get(e.fecha) ?? [];
    arr.push({ nombre: sv?.nombre ?? "Eventos", total: Number(e.utilidad), color: sv?.color ?? COLOR_SERVICIO_DEFAULT });
    detPorDia.set(e.fecha, arr);
  }
  const diaSemanaFmt = new Intl.DateTimeFormat("es-CO", { weekday: "short" });
  const diaLargoFmt = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long" });
  const fechaCortaFmt = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" });
  const dias7: { fecha: string; label: string; fechaLarga: string; fechaCorta: string; monto: number; facturas: number; esHoy: boolean; detalle: { nombre: string; total: number; color: string }[] }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
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
        color: servicioCat.get(id)?.color ?? COLOR_SERVICIO_DEFAULT,
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
  const topCliMax = Math.max(1, ...topClientes.map((t) => t.pagado));

  // ───────── Clases por cerrar ─────────
  const nowMs = now.getTime();
  let totalVencidas = 0;
  for (const c of pendRes.data ?? []) {
    const dt = instanteClase(c.fecha, c.hora_inicio, "23:59:00");
    if (nowMs > dt + 24 * 3600 * 1000) totalVencidas++;
  }

  // ───────── Clases agendadas y ocupación de canchas de la semana (EasyCancha) ─────────
  const [semanaEC, ocupacion] = await Promise.all([semanaECPromise, ocupacionPromise]);
  const ecMax = Math.max(1, ...semanaEC.ranking.map((r) => r.clases));

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="cdaf-headline">Dashboard</h1>
        <PeriodoToggle periodo={periodo} desde={desde} hasta={hasta} />
      </div>

      {/* ── Banner: el marcador de hoy ── */}
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
                  <p className="mt-0.5 text-xs text-white/70">
                    {hoyFacturas} factura(s) hoy · sync cada 20 min
                  </p>
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
        <div className="border-destructive/30 bg-destructive/[0.06] flex items-center justify-between gap-3 rounded-xl border p-4 shadow-sm">
          <span className="flex items-center gap-2.5 text-sm">
            <TriangleAlert className="text-destructive size-5 shrink-0" />
            <span><strong>{totalVencidas}</strong> clase(s) sin cerrar hace más de 24 h.</span>
          </span>
          <Link href="/cierre/vencidas" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>Ver vencidas</Link>
        </div>
      )}

      {/* Transparencia: las cifras de arriba NO incluyen los eventos sin cerrar. Sin este
          aviso, el dashboard no cuadraría con Siigo y no se sabría por qué. */}
      {facturadoRetenido > 0 && (
        <div className="border-warning/40 bg-warning/10 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 shadow-sm">
          <span className="flex items-center gap-2.5 text-sm">
            <Trophy className="text-warning size-5 shrink-0" />
            <span>
              <strong className="tabular-nums">{COP.format(facturadoRetenido)}</strong> facturados en{" "}
              <strong>{eventosAbiertos}</strong> evento(s) sin cerrar todavía no entran a estas cifras. Al cerrarlos
              entra su <strong>utilidad</strong> (ingresos − gastos), no el bruto.
            </span>
          </span>
          <Link href="/eventos" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>Ver eventos</Link>
        </div>
      )}

      {/* ── Bento: marcador del periodo + comparativo de facturado ── */}
      <div className={cn("grid gap-4 lg:grid-cols-3", ENTRAR)} style={retraso(1)}>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Marcador del periodo</CardTitle>
            <CardDescription>
              Ingresos pagados (Siigo) · {curStartIso} a {curEndIso}
              {utilEventos !== 0 && ` · incluye ${COP.format(utilEventos)} de utilidad de eventos cerrados`}
            </CardDescription>
            <CardAction>
              <Link href={hrefIngresos} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm font-medium">
                Ver detalle <ArrowRight className="size-3.5" />
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-6">
            <div className="flex flex-wrap items-baseline gap-3">
              <CountUp value={periodTotal} durationMs={1100} className="font-heading text-4xl font-bold tracking-tight" />
              {deltaPct !== null && (
                <span className={cn("inline-flex items-center gap-1 text-sm font-semibold", deltaPct >= 0 ? "text-[#46530a]" : "text-destructive")}>
                  {deltaPct >= 0 ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
                  {deltaPct >= 0 ? "+" : ""}{deltaPct}%
                  <span className="text-muted-foreground font-normal">vs. anterior</span>
                </span>
              )}
            </div>
            {serieDiaria.length > 1 ? (
              <div className="min-h-[150px] flex-1">
                <ChartArea puntos={serieDiaria} fill />
              </div>
            ) : (
              <EmptyState icon={Wallet} title="Sin ingresos en el periodo" description="Cuando entren facturas de Siigo verás la curva aquí." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Facturado vs. periodo anterior</CardTitle>
            <CardDescription>Lo emitido en facturas (no lo cobrado)</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col">
            {acumFactActual.length > 1 && acumFactPrevio.length > 1 ? (
              <ChartComparativo
                actual={{
                  label: etiquetaPeriodo(curStartIso, "Este periodo"),
                  rango: rangoCorto(curStartIso, curEndIso),
                  acum: acumFactActual,
                }}
                previo={{
                  label: etiquetaPeriodo(prevStartIso, "Periodo anterior"),
                  rango: rangoCorto(prevStartIso, prevEndIso),
                  acum: acumFactPrevio,
                }}
              />
            ) : (
              <EmptyState
                icon={Wallet}
                title="Sin facturación para comparar"
                description="Se necesitan datos del periodo anterior para el comparativo."
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Recaudo + composición del ingreso ── */}
      <div className={cn("grid gap-4 lg:grid-cols-4", ENTRAR)} style={retraso(2)}>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recaudo del periodo</CardTitle>
            <CardAction>
              <Link href="/cartera" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm font-medium">
                Ver cartera <ArrowRight className="size-3.5" />
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-4">
              <RadialGauge pct={pctRecaudo} />
              <dl className="grid flex-1 gap-2 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground text-xs">Facturado en el periodo</dt>
                  <dd className="font-medium tabular-nums">{COP.format(facturadoPeriodo)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Cobrado</dt>
                  <dd className="font-medium tabular-nums">{COP.format(cobradoPeriodo)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Pendiente del periodo</dt>
                  <dd className={cn("font-semibold tabular-nums", saldoPeriodo > 0 ? "text-destructive" : "")}>{COP.format(saldoPeriodo)}</dd>
                </div>
              </dl>
            </div>
            <p className="text-muted-foreground border-t pt-2.5 text-xs">
              Cartera total (todas las fechas): <strong className="text-foreground tabular-nums">{COP.format(carteraGlobal)}</strong>
              {" — incluye la deuda de los eventos, que sí se sigue cobrando."}
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Composición del ingreso</CardTitle>
            <CardDescription>Por servicio · facturado · {curStartIso} a {curEndIso}</CardDescription>
          </CardHeader>
          <CardContent>
            {familiasIngreso.length > 0 ? (
              <ChartDonut segmentos={familiasIngreso} subtitulo={`${curStartIso} a ${curEndIso}`} />
            ) : (
              <EmptyState icon={Wallet} title="Sin facturación en el periodo" description="Cuando entren facturas verás la composición aquí." />
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Semana + tendencias ── */}
      <div className={cn("grid gap-6 lg:grid-cols-2", ENTRAR)} style={retraso(3)}>
        <Card>
          <CardHeader>
            <CardTitle>Los últimos 7 días</CardTitle>
            <CardDescription>Ingreso pagado por día · {COP.format(totalSemana)} en la semana</CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <ChartBarrasSemana dias={dias7} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tendencias por servicio</CardTitle>
            <CardDescription>
              Facturado del periodo vs. el anterior ({prevStartIso} a {prevEndIso})
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {enAlza.length === 0 && enBaja.length === 0 ? (
              <EmptyState icon={TrendingUp} title="Sin variaciones" description="No hay cambios frente al periodo anterior." />
            ) : (
              [
                { titulo: "En alza", items: enAlza, up: true },
                { titulo: "En baja", items: enBaja, up: false },
              ].map(
                (sec) =>
                  sec.items.length > 0 && (
                    <div key={sec.titulo}>
                      <p className="text-muted-foreground mb-1.5 text-xs font-medium tracking-wide uppercase">{sec.titulo}</p>
                      <ul className="divide-y">
                        {sec.items.map((m) => (
                          <li key={m.id} className="flex items-center justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0">
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: m.color }} />
                              <span className="truncate font-medium">{m.nombre}</span>
                            </span>
                            <span className="flex shrink-0 items-center gap-2 tabular-nums">
                              <span className="text-muted-foreground">{COP.format(m.actual)}</span>
                              <span
                                className={cn(
                                  "inline-flex items-center gap-0.5 text-xs font-semibold",
                                  sec.up ? "text-[#46530a]" : "text-destructive",
                                )}
                              >
                                {sec.up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                                {m.pct === null ? "nuevo" : `${m.pct > 0 ? "+" : ""}${m.pct}%`}
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ),
              )
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Top clientes + top deudores ── */}
      <div className={cn("grid gap-6 lg:grid-cols-2", ENTRAR)} style={retraso(4)}>
        <Card>
          <CardHeader>
            <CardTitle>Top clientes</CardTitle>
            <CardDescription>Los 5 con mayor facturación pagada en el periodo</CardDescription>
            <CardAction>
              <Link href={hrefIngresos} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm font-medium">
                Ver ingresos <ArrowRight className="size-3.5" />
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            {topClientes.length === 0 ? (
              <EmptyState icon={Users} title="Sin clientes con pagos en el periodo" description="Aún no hay facturación pagada identificada." />
            ) : (
              <ol className="space-y-2.5">
                {topClientes.map((t, idx) => {
                  const nombreCli = t.clienteId != null ? cliName.get(t.clienteId) ?? t.nombre ?? `Cliente #${t.clienteId}` : t.nombre ?? "—";
                  return (
                    <li key={`${t.clienteId ?? t.nombre}-${idx}`} className="flex items-center gap-3 text-sm">
                      <span className="bg-primary/15 text-charcoal ring-primary/25 flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-1">
                        {idx + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="mb-1 flex items-center justify-between gap-2">
                          {t.clienteId != null ? (
                            <Link href={`/clientes/${t.clienteId}`} className="truncate font-medium hover:underline">{nombreCli}</Link>
                          ) : (
                            <span className="truncate font-medium">{nombreCli}</span>
                          )}
                          <span className="shrink-0 font-semibold tabular-nums">{COP.format(t.pagado)}</span>
                        </span>
                        <span className="bg-muted block h-1.5 w-full overflow-hidden rounded-full">
                          <span className="bg-charcoal/70 block h-full rounded-full" style={{ width: `${(t.pagado / topCliMax) * 100}%` }} />
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top deudores</CardTitle>
            <CardDescription>Los 5 pendientes de mayor valor · Cartera {COP.format(carteraTotal + deudaSinCliente)}</CardDescription>
            <CardAction>
              <Link href="/cartera" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm font-medium">
                Ver cartera <ArrowRight className="size-3.5" />
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            {topPendientes.length === 0 ? (
              <EmptyState icon={Wallet} title="Cartera al día" description="Nadie con saldo pendiente. 🎾" />
            ) : (
              <ul className="divide-y">
                {topPendientes.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-3 py-2.5 text-sm first:pt-0 last:pb-0">
                    <span className="min-w-0 leading-tight">
                      {f.cliente_id ? (
                        <Link href={`/clientes/${f.cliente_id}`} className="block truncate font-medium hover:underline">
                          {cliName.get(f.cliente_id) ?? `Cliente #${f.cliente_id}`}
                        </Link>
                      ) : f.cliente_nombre_siigo ? (
                        <span className="block truncate font-medium">{f.cliente_nombre_siigo}</span>
                      ) : (
                        <span className="text-muted-foreground block">Sin identificar</span>
                      )}
                      <span className="text-muted-foreground block text-xs">{f.numero ?? "—"} · {f.fecha}</span>
                    </span>
                    <span className="text-destructive shrink-0 font-semibold tabular-nums">{COP.format(f.saldo)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Ocupación de canchas (EasyCancha) ── */}
      <section className={ENTRAR} style={retraso(5)}>
        <Card>
          <CardHeader>
            <CardTitle>Ocupación de canchas</CardTitle>
            <CardDescription>
              Tiempo de cancha reservado sobre el disponible · EasyCancha · semana del {ocupacion.desde} al{" "}
              {ocupacion.hasta}
            </CardDescription>
            <CardAction>
              <Link
                href="/clases?vista=cancha"
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm font-medium"
              >
                Ver calendario <ArrowRight className="size-3.5" />
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            <ChartOcupacion datos={ocupacion} />
          </CardContent>
        </Card>
      </section>

      {/* ── Clases agendadas (EasyCancha) ── */}
      <div className={cn(ENTRAR)} style={retraso(6)}>
        <Card>
          <CardHeader>
            <CardTitle>Clases agendadas esta semana</CardTitle>
            <CardDescription>
              Por profesor · EasyCancha · {semanaEC.desde} a {semanaEC.hasta}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {semanaEC.ranking.length === 0 ? (
              <EmptyState icon={CalendarClock} title="Sin clases agendadas" description="No hay reservas de clases en EasyCancha esta semana." />
            ) : (
              <ol className="space-y-2.5">
                {semanaEC.ranking.slice(0, 8).map((r, idx) => (
                  <li key={r.nombre} className="flex items-center gap-3 text-sm">
                    <span className="text-muted-foreground w-4 shrink-0 text-center font-semibold tabular-nums">{idx + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="mb-1 flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{r.nombre}</span>
                        <span className="text-muted-foreground tabular-nums">{r.clases}</span>
                      </span>
                      <span className="bg-muted block h-1.5 w-full overflow-hidden rounded-full">
                        <span className="bg-primary block h-full rounded-full" style={{ width: `${(r.clases / ecMax) * 100}%` }} />
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

      </div>

    </div>
  );
}
