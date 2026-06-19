import Link from "next/link";
import {
  Users,
  GraduationCap,
  Building2,
  Wallet,
  CalendarClock,
  TriangleAlert,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { SuperadminDashboard } from "./superadmin-dashboard";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

function Kpi({
  label,
  value,
  icon: Icon,
  accent = false,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  accent?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="cdaf-eyebrow text-muted-foreground">{label}</p>
          <p className="font-heading text-foreground mt-1.5 truncate text-3xl font-semibold tracking-tight tabular-nums">
            {value}
          </p>
        </div>
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-xl",
            accent
              ? "bg-primary/15 text-charcoal ring-primary/25 ring-1"
              : "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="size-5" />
        </span>
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const profile = await requireProfile();

  if (profile.role === "superadmin") {
    const sp = await searchParams;
    const periodo = sp.periodo === "semana" || sp.periodo === "3m" ? sp.periodo : "mes";
    return <SuperadminDashboard periodo={periodo} nombre={profile.nombre ?? "usuario"} />;
  }

  const supabase = await createClient();
  const hoy = new Date().toISOString().slice(0, 10);
  const esProfesor = profile.role === "profesor";
  const esFinanzas = can(profile.role, "reportes_financieros", "read");

  const [{ count: nClientes }, { count: nProfes }, { count: nAcademias }] = await Promise.all([
    supabase.from("clientes").select("*", { count: "exact", head: true }).eq("estado", "activo"),
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "profesor"),
    supabase.from("academias").select("*", { count: "exact", head: true }).eq("activa", true),
  ]);

  let proxQ = supabase
    .from("clases")
    .select("id, fecha, hora_inicio, deporte, tipo")
    .gte("fecha", hoy)
    .eq("estado", "programada")
    .order("fecha")
    .order("hora_inicio")
    .limit(5);
  if (esProfesor) proxQ = proxQ.eq("profesor_id", profile.id);
  const { data: proximas } = await proxQ;

  let pendQ = supabase
    .from("clases")
    .select("id, fecha, hora_inicio")
    .eq("estado", "programada")
    .lte("fecha", hoy);
  if (esProfesor) pendQ = pendQ.eq("profesor_id", profile.id);
  const { data: pend } = await pendQ;
  const now = Date.now();
  const vencidas = (pend ?? []).filter(
    (c) => now > new Date(`${c.fecha}T${c.hora_inicio ?? "23:59"}:00`).getTime() + 24 * 3600 * 1000,
  ).length;

  let totalMes = 0;
  if (esFinanzas) {
    const d = new Date();
    const d1 = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
    const d2 = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
    const { data: pagos } = await supabase
      .from("pagos")
      .select("monto")
      .eq("estado", "asignado")
      .gte("fecha", d1)
      .lte("fecha", d2);
    totalMes = (pagos ?? []).reduce((s, p) => s + p.monto, 0);
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="cdaf-eyebrow text-muted-foreground">Hola, {profile.nombre ?? "usuario"}</p>
        <h1 className="cdaf-headline">Dashboard</h1>
      </div>

      {profile.role !== "profesor" && vencidas > 0 && (
        <div className="border-destructive/30 bg-destructive/[0.06] flex items-center justify-between gap-3 rounded-xl border p-4 shadow-sm">
          <span className="flex items-center gap-2.5 text-sm">
            <TriangleAlert className="text-destructive size-5 shrink-0" />
            <span>
              <strong>{vencidas}</strong> clase(s) sin cerrar hace más de 24 h.
            </span>
          </span>
          <Link href="/cierre" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            Ver pendientes
          </Link>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {esProfesor ? (
          <Kpi label="Mis próximas clases" value={proximas?.length ?? 0} icon={CalendarClock} accent />
        ) : (
          <>
            <Kpi label="Clientes activos" value={nClientes ?? 0} icon={Users} accent />
            <Kpi label="Profesores" value={nProfes ?? 0} icon={GraduationCap} />
            <Kpi label="Academias activas" value={nAcademias ?? 0} icon={Building2} />
            {esFinanzas ? (
              <Kpi label="Conciliado este mes" value={COP.format(totalMes)} icon={Wallet} accent />
            ) : (
              <Kpi label="Próximas clases" value={proximas?.length ?? 0} icon={CalendarClock} />
            )}
          </>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Próximas clases</CardTitle>
          <CardAction>
            <Link
              href="/clases"
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm font-medium transition-colors"
            >
              Ver agenda <ArrowRight className="size-3.5" />
            </Link>
          </CardAction>
        </CardHeader>
        <CardContent>
          {(proximas ?? []).length > 0 ? (
            <ul className="divide-y">
              {(proximas ?? []).map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span className="flex items-center gap-3">
                    <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
                      <CalendarClock className="size-4" />
                    </span>
                    <span className="leading-tight">
                      <span className="text-foreground block text-sm font-medium tabular-nums">
                        {c.fecha} · {c.hora_inicio?.slice(0, 5) ?? ""}
                      </span>
                      <span className="text-muted-foreground block text-xs">
                        {c.tipo === "academia" ? "Academia" : "Clase individual"}
                      </span>
                    </span>
                  </span>
                  {c.deporte && (
                    <Badge variant="outline" className="capitalize">
                      {c.deporte}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={CalendarClock}
              title="No hay clases próximas"
              description="Cuando programes clases aparecerán aquí."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
