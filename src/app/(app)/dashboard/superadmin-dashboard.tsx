import Link from "next/link";
import {
  Wallet,
  Users,
  CalendarClock,
  CalendarCheck,
  TriangleAlert,
  TrendingUp,
  TrendingDown,
  Trophy,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { COLOR_SERVICIO_DEFAULT } from "@/lib/finanzas";
import { rangoPeriodo, type Periodo } from "@/lib/periodo";
import { PeriodoToggle } from "./periodo-toggle";
import { IngresosChart } from "./ingresos-chart";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const ini = (nombre: string) => {
  const p = nombre.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "—";
};

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

  const [
    ingresoActualRes,
    ingresoPrevRes,
    carteraRes,
    deudaSinClienteRes,
    topPendRes,
    facPeriodoRes,
    serviciosRes,
    pendRes,
    periodoRes,
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
      .select("cliente_id, cliente_identificacion, cliente_nombre_siigo, total, saldo")
      .gte("fecha", curStartIso)
      .lte("fecha", curEndIso),
    supabase.from("servicios").select("id, nombre, color"),
    supabase.from("clases").select("profesor_id, fecha, hora_inicio").eq("estado", "programada").lte("fecha", todayIso),
    supabase.from("clases").select("estado, profesor_id").gte("fecha", curStartIso).lte("fecha", curEndIso),
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

  // ───────── Cartera (deuda = saldo de Siigo) ─────────
  const deudores = (carteraRes.data ?? [])
    .map((r) => ({ id: Number(r.cliente_id), debe: Number(r.saldo) }))
    .sort((a, b) => b.debe - a.debe);
  const carteraTotal = deudores.reduce((s, d) => s + d.debe, 0);
  const deudaSinCliente = (deudaSinClienteRes.data ?? []).reduce((s, r) => s + Number(r.saldo), 0);
  // Los 5 pendientes de pago de mayor valor (con o sin cliente asignado).
  const topPendientes = topPendRes.data ?? [];

  // ───────── Top clientes: mayor facturación PAGADA en el periodo ─────────
  // Identidad = nuestro cliente si está enlazado; si no, el NIT real de Siigo.
  // El mostrador anónimo (NIT genérico) no cuenta como "cliente".
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

  // ───────── Clases por cerrar por profesor ─────────
  const nowMs = now.getTime();
  const pendByProf = new Map<string, { count: number; vencidas: number }>();
  for (const c of pendRes.data ?? []) {
    const key = c.profesor_id ?? "none";
    const cur = pendByProf.get(key) ?? { count: 0, vencidas: 0 };
    cur.count++;
    const dt = new Date(`${c.fecha}T${c.hora_inicio ?? "23:59"}:00`).getTime();
    if (nowMs > dt + 24 * 3600 * 1000) cur.vencidas++;
    pendByProf.set(key, cur);
  }
  const totalPend = (pendRes.data ?? []).length;
  const totalVencidas = [...pendByProf.values()].reduce((s, v) => s + v.vencidas, 0);

  // ───────── Cumplimiento + ranking (periodo) ─────────
  const cump = { realizada: 0, programada: 0, cancelada: 0, no_show: 0 } as Record<string, number>;
  const dictadasByProf = new Map<string, number>();
  for (const c of periodoRes.data ?? []) {
    cump[c.estado] = (cump[c.estado] ?? 0) + 1;
    if (c.estado === "realizada" && c.profesor_id) dictadasByProf.set(c.profesor_id, (dictadasByProf.get(c.profesor_id) ?? 0) + 1);
  }
  const ranking = [...dictadasByProf.entries()].map(([id, n]) => ({ id, n })).sort((a, b) => b.n - a.n).slice(0, 5);
  const pctAsistencia = cump.realizada + cump.no_show > 0 ? Math.round((cump.realizada / (cump.realizada + cump.no_show)) * 100) : null;

  // ───────── Nombres (profesores + deudores) ─────────
  const profIds = [...new Set([...pendByProf.keys(), ...ranking.map((r) => r.id)].filter((k) => k !== "none"))];
  const profName = new Map<string, string>();
  if (profIds.length) {
    const { data } = await supabase.from("profiles").select("id, nombre").in("id", profIds);
    for (const p of data ?? []) profName.set(p.id, p.nombre ?? "—");
  }
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

  const rankMax = Math.max(1, ...ranking.map((r) => r.n));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="cdaf-eyebrow text-muted-foreground">Hola, {nombre}</p>
          <h1 className="cdaf-headline">Dashboard</h1>
        </div>
        <PeriodoToggle periodo={periodo} desde={desde} hasta={hasta} />
      </div>

      {totalVencidas > 0 && (
        <div className="border-destructive/30 bg-destructive/[0.06] flex items-center justify-between gap-3 rounded-xl border p-4 shadow-sm">
          <span className="flex items-center gap-2.5 text-sm">
            <TriangleAlert className="text-destructive size-5 shrink-0" />
            <span><strong>{totalVencidas}</strong> clase(s) sin cerrar hace más de 24 h.</span>
          </span>
          <Link href="/cierre/vencidas" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>Ver vencidas</Link>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          href={`/ingresos?periodo=${periodo}${periodo === "custom" && desde && hasta ? `&desde=${desde}&hasta=${hasta}` : ""}`}
          title="Ver el detalle de los ingresos"
          className="focus-visible:ring-ring block rounded-xl transition hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:outline-none"
        >
          <Stat label="Ingresos del periodo" value={COP.format(periodTotal)} icon={Wallet} accent delta={deltaPct} />
        </Link>
        <Link
          href="/cartera"
          title="Ver las facturas pendientes de pago"
          className="focus-visible:ring-ring block rounded-xl transition hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:outline-none"
        >
          <Stat
            label="Cartera por cobrar"
            value={COP.format(carteraTotal + deudaSinCliente)}
            icon={TriangleAlert}
            tone="warn"
            sub={deudaSinCliente > 0 ? `${COP.format(deudaSinCliente)} por conciliar` : `${deudores.length} cliente(s)`}
          />
        </Link>
        <Stat label="Clientes activos" value={String(clientesRes.count ?? 0)} icon={Users} />
        <Stat label="Clases por cerrar" value={String(totalPend)} icon={CalendarClock} sub={totalVencidas > 0 ? `${totalVencidas} vencidas` : "al día"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ingresos por tipo</CardTitle>
          <CardDescription>
            Pagado en el periodo (Siigo) · {COP.format(periodTotal)}
            {periodo === "custom" ? ` · ${curStartIso} a ${curEndIso}` : ""}
          </CardDescription>
          {deltaPct !== null && (
            <CardAction>
              <span className={cn("inline-flex items-center gap-1 text-sm font-medium", deltaPct >= 0 ? "text-[#46530a]" : "text-destructive")}>
                {deltaPct >= 0 ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
                {deltaPct >= 0 ? "+" : ""}{deltaPct}% <span className="text-muted-foreground font-normal">vs. anterior</span>
              </span>
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          {periodTotal > 0 ? (
            <IngresosChart familias={familiasIngreso} total={periodTotal} />
          ) : (
            <EmptyState icon={Wallet} title="Sin ingresos en el periodo" description="Concilia pagos en la bolsa de pagos para verlos aquí." />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
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
              <table className="cdaf-table">
                <thead>
                  <tr>
                    <th className="px-2 py-2">Cliente</th>
                    <th className="px-2 py-2">Factura</th>
                    <th className="px-2 py-2 text-right">Debe</th>
                  </tr>
                </thead>
                <tbody>
                  {topPendientes.map((f) => (
                    <tr key={f.id}>
                      <td className="px-2 py-2.5">
                        {f.cliente_id ? (
                          <Link href={`/clientes/${f.cliente_id}`} className="font-medium hover:underline">
                            {cliName.get(f.cliente_id) ?? `Cliente #${f.cliente_id}`}
                          </Link>
                        ) : f.cliente_nombre_siigo ? (
                          <span className="font-medium">{f.cliente_nombre_siigo}</span>
                        ) : (
                          <span className="text-muted-foreground">Sin identificar</span>
                        )}
                      </td>
                      <td className="text-muted-foreground px-2 py-2.5 text-xs whitespace-nowrap">
                        {f.numero ?? "—"} · {f.fecha}
                      </td>
                      <td className="text-destructive px-2 py-2.5 text-right font-medium tabular-nums">{COP.format(f.saldo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top clientes</CardTitle>
            <CardDescription>Los 5 con mayor facturación pagada · {curStartIso} a {curEndIso}</CardDescription>
            <CardAction>
              <Link
                href={`/ingresos?periodo=${periodo}${periodo === "custom" && desde && hasta ? `&desde=${desde}&hasta=${hasta}` : ""}`}
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm font-medium"
              >
                Ver ingresos <ArrowRight className="size-3.5" />
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            {topClientes.length === 0 ? (
              <EmptyState icon={Users} title="Sin clientes con pagos en el periodo" description="Aún no hay facturación pagada identificada." />
            ) : (
              <ul className="divide-y">
                {topClientes.map((t, idx) => {
                  const nombre = t.clienteId != null ? cliName.get(t.clienteId) ?? t.nombre ?? `Cliente #${t.clienteId}` : t.nombre ?? "—";
                  return (
                    <li key={`${t.clienteId ?? t.nombre}-${idx}`} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="bg-primary/15 text-charcoal ring-primary/25 flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-1">
                          {idx + 1}
                        </span>
                        <span className="min-w-0 leading-tight">
                          {t.clienteId != null ? (
                            <Link href={`/clientes/${t.clienteId}`} className="block truncate text-sm font-medium hover:underline">
                              {nombre}
                            </Link>
                          ) : (
                            <span className="block truncate text-sm font-medium">{nombre}</span>
                          )}
                          <span className="text-muted-foreground block text-xs">Pagado en el periodo</span>
                        </span>
                      </span>
                      <span className="shrink-0 text-right text-sm font-semibold tabular-nums">{COP.format(t.pagado)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Cumplimiento de clases</CardTitle>
            <CardDescription>En el periodo seleccionado</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Linea label="Dictadas (realizadas)" value={cump.realizada ?? 0} />
            <Linea label="Programadas" value={cump.programada ?? 0} />
            <Linea label="Canceladas" value={cump.cancelada ?? 0} />
            <Linea label="No-show" value={cump.no_show ?? 0} />
            <div className="flex items-center justify-between border-t pt-2 font-medium">
              <span>% asistencia</span>
              <span className="tabular-nums">{pctAsistencia === null ? "—" : `${pctAsistencia}%`}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ranking de profesores</CardTitle>
            <CardDescription>Clases dictadas en el periodo</CardDescription>
          </CardHeader>
          <CardContent>
            {ranking.length === 0 ? (
              <EmptyState icon={Trophy} title="Sin clases dictadas" description="Aún no hay cierres en el periodo." />
            ) : (
              <ol className="space-y-2.5">
                {ranking.map((r, idx) => (
                  <li key={r.id} className="flex items-center gap-3 text-sm">
                    <span className="text-muted-foreground w-4 shrink-0 text-center font-semibold tabular-nums">{idx + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="mb-1 flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{profName.get(r.id) ?? "—"}</span>
                        <span className="text-muted-foreground tabular-nums">{r.n}</span>
                      </span>
                      <span className="bg-muted block h-1.5 w-full overflow-hidden rounded-full">
                        <span className="bg-primary block h-full rounded-full" style={{ width: `${(r.n / rankMax) * 100}%` }} />
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

function Stat({
  label,
  value,
  icon: Icon,
  accent,
  tone,
  sub,
  delta,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  accent?: boolean;
  tone?: "warn";
  sub?: string;
  delta?: number | null;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="cdaf-eyebrow text-muted-foreground">{label}</p>
          <p className="font-heading text-foreground mt-1.5 truncate text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
          {sub && <p className="text-muted-foreground mt-0.5 text-xs">{sub}</p>}
          {typeof delta === "number" && (
            <span className={cn("mt-1 inline-flex items-center gap-0.5 text-xs font-medium", delta >= 0 ? "text-[#46530a]" : "text-destructive")}>
              {delta >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
              {delta >= 0 ? "+" : ""}{delta}%
            </span>
          )}
        </div>
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-xl",
            accent
              ? "bg-primary/15 text-charcoal ring-primary/25 ring-1"
              : tone === "warn"
                ? "bg-warning/15 text-[#8a5600]"
                : "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="size-5" />
        </span>
      </CardContent>
    </Card>
  );
}

function Linea({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
