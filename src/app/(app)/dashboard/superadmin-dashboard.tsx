import Link from "next/link";
import {
  Wallet,
  Users,
  CalendarClock,
  TriangleAlert,
  TrendingUp,
  TrendingDown,
  ArrowRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { COLOR_SERVICIO_DEFAULT } from "@/lib/finanzas";
import { clasesSemanaPorProfesor } from "@/lib/easycancha";
import { rangoPeriodo, isoDia, type Periodo } from "@/lib/periodo";
import { PeriodoToggle } from "./periodo-toggle";
import { CountUp } from "./count-up";
import { ChartArea } from "./chart-area";
import { ChartBarrasSemana } from "./chart-barras-semana";
import { ChartDonut } from "./chart-donut";
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
  const hace6Iso = isoDia(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6));

  const [
    ingresoActualRes,
    ingresoPrevRes,
    carteraRes,
    deudaSinClienteRes,
    topPendRes,
    facPeriodoRes,
    hoyRes,
    sem7Res,
    serviciosRes,
    pendRes,
    clientesRes,
  ] = await Promise.all([
    supabase.rpc("siigo_ingreso_servicio", { p_desde: curStartIso, p_hasta: curEndIso }),
    supabase.rpc("siigo_ingreso_servicio", { p_desde: prevStartIso, p_hasta: prevEndIso }),
    supabase.rpc("siigo_cartera"),
    supabase.from("siigo_facturas").select("saldo").gt("saldo", 0).is("cliente_id", null),
    supabase
      .from("siigo_facturas")
      .select("id, numero, fecha, cliente_id, cliente_nombre_siigo, saldo")
      .gt("saldo", 0)
      .order("saldo", { ascending: false })
      .limit(5),
    supabase
      .from("siigo_facturas")
      .select("fecha, cliente_id, cliente_identificacion, cliente_nombre_siigo, total, saldo")
      .gte("fecha", curStartIso)
      .lte("fecha", curEndIso),
    supabase.from("siigo_facturas").select("total, saldo").eq("fecha", todayIso),
    supabase.from("siigo_facturas").select("fecha, total, saldo").gte("fecha", hace6Iso).lte("fecha", todayIso),
    supabase.from("servicios").select("id, nombre, color"),
    supabase.from("clases").select("profesor_id, fecha, hora_inicio").eq("estado", "programada").lte("fecha", todayIso),
    supabase.from("clientes").select("*", { count: "exact", head: true }).eq("estado", "activo"),
  ]);

  // ───────── Ingresos por servicio (porción pagada, desde Siigo) ─────────
  const servicioCat = new Map((serviciosRes.data ?? []).map((s) => [s.id, s]));
  const famTotal = new Map<number, number>();
  let periodTotal = 0;
  for (const r of ingresoActualRes.data ?? []) {
    const id = r.servicio_id ?? -1;
    const monto = Number(r.monto);
    periodTotal += monto;
    famTotal.set(id, (famTotal.get(id) ?? 0) + monto);
  }
  const prevTotal = (ingresoPrevRes.data ?? []).reduce((s, r) => s + Number(r.monto), 0);
  const familiasIngreso = [...famTotal.entries()]
    .map(([id, total]) => {
      const sv = servicioCat.get(id);
      return { nombre: sv?.nombre ?? "Sin categoría", total, color: sv?.color ?? COLOR_SERVICIO_DEFAULT };
    })
    .filter((t) => t.total > 0)
    .sort((a, b) => b.total - a.total);
  const deltaPct = prevTotal > 0 ? Math.round(((periodTotal - prevTotal) / prevTotal) * 100) : null;

  // ───────── Marcador de hoy (banner) ─────────
  const hoyTotal = (hoyRes.data ?? []).reduce((s, f) => s + ((f.total ?? 0) - (f.saldo ?? 0)), 0);
  const hoyFacturas = (hoyRes.data ?? []).length;

  // ───────── Serie diaria del periodo (línea de juego del héroe) ─────────
  const pagadoPorDia = new Map<string, number>();
  for (const f of facPeriodoRes.data ?? []) {
    pagadoPorDia.set(f.fecha, (pagadoPorDia.get(f.fecha) ?? 0) + ((f.total ?? 0) - (f.saldo ?? 0)));
  }
  const serieDiaria: { fecha: string; monto: number }[] = [];
  for (let d = new Date(`${curStartIso}T00:00:00`); ; d.setDate(d.getDate() + 1)) {
    const isoD = isoDia(d);
    if (isoD > curEndIso) break;
    serieDiaria.push({ fecha: isoD, monto: pagadoPorDia.get(isoD) ?? 0 });
  }

  // ───────── Recaudo del periodo (gauge): cobrado vs facturado ─────────
  const facturadoPeriodo = (facPeriodoRes.data ?? []).reduce((s, f) => s + (f.total ?? 0), 0);
  const saldoPeriodo = (facPeriodoRes.data ?? []).reduce((s, f) => s + (f.saldo ?? 0), 0);
  const cobradoPeriodo = facturadoPeriodo - saldoPeriodo;
  const pctRecaudo = facturadoPeriodo > 0 ? (cobradoPeriodo / facturadoPeriodo) * 100 : 0;

  // ───────── Barras de la semana (últimos 7 días) ─────────
  const diaSemanaFmt = new Intl.DateTimeFormat("es-CO", { weekday: "short" });
  const pagado7 = new Map<string, number>();
  for (const f of sem7Res.data ?? []) pagado7.set(f.fecha, (pagado7.get(f.fecha) ?? 0) + ((f.total ?? 0) - (f.saldo ?? 0)));
  const dias7: { fecha: string; label: string; monto: number; esHoy: boolean }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const isoD = isoDia(d);
    dias7.push({ fecha: isoD, label: diaSemanaFmt.format(d).replace(".", ""), monto: pagado7.get(isoD) ?? 0, esHoy: isoD === todayIso });
  }
  const totalSemana = dias7.reduce((s, d) => s + d.monto, 0);

  // ───────── Tendencias: qué servicios suben y cuáles bajan vs. el periodo anterior ─────────
  const prevPorServicio = new Map<number, number>();
  for (const r of ingresoPrevRes.data ?? []) {
    const id = r.servicio_id ?? -1;
    prevPorServicio.set(id, (prevPorServicio.get(id) ?? 0) + Number(r.monto));
  }
  const movimientos = [...new Set([...famTotal.keys(), ...prevPorServicio.keys()])]
    .map((id) => {
      const actual = famTotal.get(id) ?? 0;
      const previo = prevPorServicio.get(id) ?? 0;
      const sv = servicioCat.get(id);
      return {
        id,
        nombre: sv?.nombre ?? "Sin categoría",
        color: sv?.color ?? COLOR_SERVICIO_DEFAULT,
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

  // ───────── Top clientes: mayor facturación PAGADA en el periodo ─────────
  const GENERIC_NIT = /^(\d)\1+$/;
  const accTop = new Map<string, { clienteId: number | null; nombre: string | null; pagado: number }>();
  for (const f of facPeriodoRes.data ?? []) {
    const pagado = (f.total ?? 0) - (f.saldo ?? 0);
    if (pagado <= 0) continue;
    let key: string;
    if (f.cliente_id != null) key = `c${f.cliente_id}`;
    else {
      const nit = f.cliente_identificacion?.trim();
      if (!nit || GENERIC_NIT.test(nit)) continue;
      key = `n${nit}`;
    }
    const cur = accTop.get(key) ?? { clienteId: f.cliente_id, nombre: f.cliente_nombre_siigo, pagado: 0 };
    cur.pagado += pagado;
    if (!cur.nombre && f.cliente_nombre_siigo) cur.nombre = f.cliente_nombre_siigo;
    accTop.set(key, cur);
  }
  const topClientes = [...accTop.values()].sort((a, b) => b.pagado - a.pagado).slice(0, 5);
  const topCliMax = Math.max(1, ...topClientes.map((t) => t.pagado));

  // ───────── Clases por cerrar ─────────
  const nowMs = now.getTime();
  let totalVencidas = 0;
  for (const c of pendRes.data ?? []) {
    const dt = new Date(`${c.fecha}T${c.hora_inicio ?? "23:59"}:00`).getTime();
    if (nowMs > dt + 24 * 3600 * 1000) totalVencidas++;
  }
  const totalPend = (pendRes.data ?? []).length;

  // ───────── Clases agendadas de la semana (EasyCancha) ─────────
  const semanaEC = await semanaECPromise;
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
              <h2 className="font-heading mt-1 text-2xl font-bold tracking-tight italic sm:text-3xl">¡Hola, {nombre}! 👋</h2>
              <p className="mt-1 text-sm text-white/70">Así va el marcador de hoy en el centro.</p>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <CountUp value={hoyTotal} className="font-heading text-primary block text-3xl font-bold tracking-tight sm:text-4xl" />
                <p className="mt-0.5 text-xs text-white/70">
                  {hoyFacturas} factura(s) hoy · sync cada 20 min
                </p>
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

      {/* ── Bento: héroe del periodo + recaudo + mini-tiles ── */}
      <div className={cn("grid gap-4 lg:grid-cols-3", ENTRAR)} style={retraso(1)}>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Marcador del periodo</CardTitle>
            <CardDescription>Ingresos pagados (Siigo) · {curStartIso} a {curEndIso}</CardDescription>
            <CardAction>
              <Link href={hrefIngresos} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm font-medium">
                Ver detalle <ArrowRight className="size-3.5" />
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-6">
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
              <div className="pb-5">
                <ChartArea puntos={serieDiaria} height={110} />
              </div>
            ) : (
              <EmptyState icon={Wallet} title="Sin ingresos en el periodo" description="Cuando entren facturas de Siigo verás la curva aquí." />
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="flex-1">
            <CardHeader>
              <CardTitle>Recaudo del periodo</CardTitle>
              <CardAction>
                <Link href="/cartera" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm font-medium">
                  Ver cartera <ArrowRight className="size-3.5" />
                </Link>
              </CardAction>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-4">
              <RadialGauge pct={pctRecaudo} />
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-muted-foreground text-xs">Facturado</dt>
                  <dd className="font-medium tabular-nums">{COP.format(facturadoPeriodo)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Cobrado</dt>
                  <dd className="font-medium tabular-nums">{COP.format(cobradoPeriodo)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Pendiente</dt>
                  <dd className={cn("font-semibold tabular-nums", saldoPeriodo > 0 ? "text-destructive" : "")}>{COP.format(saldoPeriodo)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardContent className="space-y-1.5">
                <span className="bg-primary/15 text-charcoal ring-primary/25 flex size-10 items-center justify-center rounded-xl ring-1">
                  <Users className="size-5" />
                </span>
                <CountUp value={clientesRes.count ?? 0} format="num" className="font-heading block text-2xl font-bold tracking-tight" />
                <p className="text-muted-foreground text-xs">Clientes activos</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-1.5">
                <span
                  className={cn(
                    "flex size-10 items-center justify-center rounded-xl",
                    totalVencidas > 0 ? "bg-warning/15 text-[#8a5600]" : "bg-muted text-muted-foreground",
                  )}
                >
                  <CalendarClock className="size-5" />
                </span>
                <CountUp value={totalPend} format="num" className="font-heading block text-2xl font-bold tracking-tight" />
                <p className="text-muted-foreground text-xs">
                  Clases por cerrar{totalVencidas > 0 ? ` · ${totalVencidas} vencidas` : ""}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* ── Semana + composición ── */}
      <div className={cn("grid gap-6 lg:grid-cols-2", ENTRAR)} style={retraso(2)}>
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
            <CardTitle>Composición del ingreso</CardTitle>
            <CardDescription>Por servicio · {curStartIso} a {curEndIso}</CardDescription>
          </CardHeader>
          <CardContent>
            {familiasIngreso.length > 0 ? (
              <ChartDonut segmentos={familiasIngreso} />
            ) : (
              <EmptyState icon={Wallet} title="Sin ingresos en el periodo" description="Cuando entren facturas verás la composición aquí." />
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Top clientes + top deudores ── */}
      <div className={cn("grid gap-6 lg:grid-cols-2", ENTRAR)} style={retraso(3)}>
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

      {/* ── EasyCancha + tendencias ── */}
      <div className={cn("grid gap-6 lg:grid-cols-2", ENTRAR)} style={retraso(4)}>
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

        <Card>
          <CardHeader>
            <CardTitle>Tendencias por servicio</CardTitle>
            <CardDescription>
              Ingresos del periodo vs. el anterior ({prevStartIso} a {prevEndIso})
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
    </div>
  );
}
