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
import {
  valorPaquete,
  esperadoAcademiasCliente,
  clasificarServicioPago,
  COLOR_SERVICIO_DEFAULT,
} from "@/lib/finanzas";
import { PeriodoToggle } from "./periodo-toggle";
import { IngresosChart } from "./ingresos-chart";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const DAY = 86400000;
const RE_ISO = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const ini = (nombre: string) => {
  const p = nombre.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "—";
};

type Periodo = "semana" | "mes" | "3m" | "custom";

function rangoPeriodo(periodo: Periodo, now: Date, desde?: string, hasta?: string) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayIso = iso(today);
  let curStart: Date;
  let curEnd = today;

  if (periodo === "custom" && desde && hasta && RE_ISO.test(desde) && RE_ISO.test(hasta) && desde <= hasta) {
    curStart = new Date(`${desde}T00:00:00`);
    const h = new Date(`${hasta}T00:00:00`);
    curEnd = iso(h) > todayIso ? today : h;
  } else if (periodo === "semana") {
    curStart = addDays(today, -6);
  } else if (periodo === "3m") {
    curStart = new Date(today.getFullYear(), today.getMonth() - 2, 1);
  } else {
    curStart = addDays(today, -29);
  }

  const curEndIso = iso(curEnd);
  const spanDays = Math.max(1, Math.round((curEnd.getTime() - curStart.getTime()) / DAY) + 1);
  const prevEnd = addDays(curStart, -1);
  const prevStart = addDays(prevEnd, -(spanDays - 1));
  return { curStartIso: iso(curStart), curEndIso, todayIso, prevStartIso: iso(prevStart), prevEndIso: iso(prevEnd) };
}

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
    pagosRes,
    pqCliRes,
    catsRes,
    inscRes,
    acasRes,
    asgRes,
    pendRes,
    periodoRes,
    clientesRes,
    serviciosRes,
  ] = await Promise.all([
    supabase.from("pagos").select("id, monto, fecha, estado, servicio_id").eq("estado", "asignado").gte("fecha", prevStartIso).lte("fecha", curEndIso),
    supabase.from("paquetes_cliente").select("cliente_id, catalogo_id, descuento_pct"),
    supabase.from("paquetes_catalogo").select("id, precio, descuento_pct"),
    supabase.from("inscripciones").select("cliente_id, academia_id, descuento_pct, fecha_inscripcion, plan_frecuencia").eq("activa", true),
    supabase.from("academias").select("id, precio, matricula, deporte, dias_semana"),
    supabase.from("asignaciones_pago").select("cliente_id, servicio, pago_id"),
    supabase.from("clases").select("profesor_id, fecha, hora_inicio").eq("estado", "programada").lte("fecha", todayIso),
    supabase.from("clases").select("estado, profesor_id").gte("fecha", curStartIso).lte("fecha", curEndIso),
    supabase.from("clientes").select("*", { count: "exact", head: true }).eq("estado", "activo"),
    supabase.from("servicios").select("id, nombre, color"),
  ]);

  // ───────── Ingresos por servicio (periodo + previo) ─────────
  const servicioCat = new Map((serviciosRes.data ?? []).map((s) => [s.id, s]));
  const famTotal = new Map<number, number>();
  let periodTotal = 0;
  let prevTotal = 0;
  for (const p of pagosRes.data ?? []) {
    const f = p.fecha;
    if (f >= curStartIso && f <= curEndIso) {
      periodTotal += p.monto;
      famTotal.set(p.servicio_id, (famTotal.get(p.servicio_id) ?? 0) + p.monto);
    } else if (f >= prevStartIso && f <= prevEndIso) {
      prevTotal += p.monto;
    }
  }
  const familiasIngreso = [...famTotal.entries()]
    .map(([id, total]) => {
      const s = servicioCat.get(id);
      return { nombre: s?.nombre ?? "Otro", total, color: s?.color ?? COLOR_SERVICIO_DEFAULT };
    })
    .filter((t) => t.total > 0)
    .sort((a, b) => b.total - a.total);
  const deltaPct = prevTotal > 0 ? Math.round(((periodTotal - prevTotal) / prevTotal) * 100) : null;

  // ───────── Cartera (saldos pendientes de todos los clientes) ─────────
  const catMap = new Map((catsRes.data ?? []).map((c) => [c.id, c]));
  const acaMap = new Map((acasRes.data ?? []).map((a) => [a.id, a]));
  const montoByPago = new Map<number, number>();
  for (const p of pagosRes.data ?? []) montoByPago.set(p.id, p.monto);
  // los pagos de cartera pueden ser de cualquier fecha → traer los que falten
  const faltantes = [...new Set((asgRes.data ?? []).map((a) => a.pago_id).filter((id) => !montoByPago.has(id)))];
  if (faltantes.length) {
    const { data } = await supabase.from("pagos").select("id, monto").in("id", faltantes);
    for (const p of data ?? []) montoByPago.set(p.id, p.monto);
  }

  const esperadoByCli = new Map<number, number>();
  const pagadoByCli = new Map<number, number>();
  for (const pc of pqCliRes.data ?? []) {
    const cat = pc.catalogo_id ? catMap.get(pc.catalogo_id) : null;
    if (!cat) continue;
    const v = valorPaquete(cat.precio, Number(cat.descuento_pct), Number(pc.descuento_pct));
    esperadoByCli.set(pc.cliente_id, (esperadoByCli.get(pc.cliente_id) ?? 0) + v);
  }
  // Academia: cobro por sesión + matrícula semestral por deporte (mismo modelo que la ficha).
  const sesionesCli = new Map<number, Map<number, number>>();
  {
    const { data: acaClases } = await supabase.from("clases").select("id, academia_id").eq("tipo", "academia").eq("estado", "realizada");
    const acaDeClase = new Map<number, number>();
    for (const c of acaClases ?? []) if (c.academia_id != null) acaDeClase.set(c.id, c.academia_id);
    const ids = [...acaDeClase.keys()];
    if (ids.length) {
      const { data: asis } = await supabase.from("asistencias").select("cliente_id, clase_id, estado").in("clase_id", ids);
      for (const a of asis ?? []) {
        const acaId = acaDeClase.get(a.clase_id);
        if (acaId == null || a.estado === "excusa_medica") continue;
        let m = sesionesCli.get(a.cliente_id);
        if (!m) {
          m = new Map();
          sesionesCli.set(a.cliente_id, m);
        }
        m.set(acaId, (m.get(acaId) ?? 0) + 1);
      }
    }
  }
  const inscByCli = new Map<number, { academia_id: number; descuento_pct: number; plan_frecuencia: number; fecha_inscripcion: string }[]>();
  for (const i of inscRes.data ?? []) {
    const arr = inscByCli.get(i.cliente_id) ?? [];
    arr.push({ academia_id: i.academia_id, descuento_pct: Number(i.descuento_pct), plan_frecuencia: i.plan_frecuencia, fecha_inscripcion: i.fecha_inscripcion });
    inscByCli.set(i.cliente_id, arr);
  }
  for (const [cli, inscs] of inscByCli) {
    const { total } = esperadoAcademiasCliente(inscs, acaMap, sesionesCli.get(cli) ?? new Map());
    esperadoByCli.set(cli, (esperadoByCli.get(cli) ?? 0) + total);
  }
  // Clases particulares (individuales sin paquete): cada una suma su precio a la cartera.
  {
    const { data: cp } = await supabase
      .from("clases")
      .select("cliente_id, precio, valor_facturado")
      .eq("tipo", "individual")
      .is("paquete_cliente_id", null)
      .in("estado", ["realizada", "no_show"]);
    for (const c of cp ?? []) {
      if (c.cliente_id == null) continue;
      esperadoByCli.set(c.cliente_id, (esperadoByCli.get(c.cliente_id) ?? 0) + (c.valor_facturado ?? c.precio ?? 0));
    }
  }
  for (const a of asgRes.data ?? []) {
    if (clasificarServicioPago(a.servicio) === "otro") continue;
    pagadoByCli.set(a.cliente_id, (pagadoByCli.get(a.cliente_id) ?? 0) + (montoByPago.get(a.pago_id) ?? 0));
  }
  const deudores: { id: number; debe: number }[] = [];
  for (const [cli, esp] of esperadoByCli) {
    const saldo = (pagadoByCli.get(cli) ?? 0) - esp;
    if (saldo < 0) deudores.push({ id: cli, debe: -saldo });
  }
  deudores.sort((a, b) => b.debe - a.debe);
  const carteraTotal = deudores.reduce((s, d) => s + d.debe, 0);
  const topDeudores = deudores.slice(0, 12);

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
  if (topDeudores.length) {
    const { data } = await supabase.from("clientes").select("id, nombres, apellidos").in("id", topDeudores.map((d) => d.id));
    for (const c of data ?? []) cliName.set(c.id, `${c.apellidos}, ${c.nombres}`);
  }

  const pendList = [...pendByProf.entries()]
    .map(([id, v]) => ({ id, nombre: id === "none" ? "Sin profesor asignado" : profName.get(id) ?? "—", ...v }))
    .sort((a, b) => b.vencidas - a.vencidas || b.count - a.count);
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
        <Stat label="Ingresos del periodo" value={COP.format(periodTotal)} icon={Wallet} accent delta={deltaPct} />
        <Stat label="Cartera por cobrar" value={COP.format(carteraTotal)} icon={TriangleAlert} tone="warn" sub={`${deudores.length} cliente(s)`} />
        <Stat label="Clientes activos" value={String(clientesRes.count ?? 0)} icon={Users} />
        <Stat label="Clases por cerrar" value={String(totalPend)} icon={CalendarClock} sub={totalVencidas > 0 ? `${totalVencidas} vencidas` : "al día"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ingresos por tipo</CardTitle>
          <CardDescription>
            Conciliado en el periodo · {COP.format(periodTotal)}
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
            <CardDescription>Cartera por cobrar · {COP.format(carteraTotal)}</CardDescription>
          </CardHeader>
          <CardContent>
            {topDeudores.length === 0 ? (
              <EmptyState icon={Wallet} title="Cartera al día" description="Nadie con saldo pendiente. 🎾" />
            ) : (
              <table className="cdaf-table">
                <thead>
                  <tr>
                    <th className="px-2 py-2">Cliente</th>
                    <th className="px-2 py-2 text-right">Debe</th>
                  </tr>
                </thead>
                <tbody>
                  {topDeudores.map((d) => (
                    <tr key={d.id}>
                      <td className="px-2 py-2.5">
                        <Link href={`/clientes/${d.id}`} className="font-medium hover:underline">{cliName.get(d.id) ?? `Cliente #${d.id}`}</Link>
                      </td>
                      <td className="text-destructive px-2 py-2.5 text-right font-medium tabular-nums">{COP.format(d.debe)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Clases por cerrar</CardTitle>
            <CardDescription>Por profesor · {totalPend} pendiente(s)</CardDescription>
            <CardAction>
              <Link href="/cierre" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm font-medium">
                Ir a cierres <ArrowRight className="size-3.5" />
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            {pendList.length === 0 ? (
              <EmptyState icon={CalendarCheck} title="No hay clases por cerrar" description="¡Todo al día!" />
            ) : (
              <ul className="divide-y">
                {pendList.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold">{ini(p.nombre)}</span>
                      <span className="min-w-0 leading-tight">
                        <span className="block truncate text-sm font-medium">{p.nombre}</span>
                        <span className="text-muted-foreground block text-xs">{p.count} pendiente(s)</span>
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {p.vencidas > 0 && <Badge variant="destructive">{p.vencidas} vencida(s)</Badge>}
                      <Link
                        href={p.id === "none" ? "/cierre" : `/cierre?profesor=${p.id}`}
                        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                      >
                        Ver
                      </Link>
                    </span>
                  </li>
                ))}
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
