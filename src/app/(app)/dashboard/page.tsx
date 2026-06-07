import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-3xl font-semibold">{value}</p>
        <p className="text-muted-foreground text-sm">{label}</p>
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const profile = await requireProfile();
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

      {(profile.role !== "profesor") && vencidas > 0 && (
        <div className="border-destructive/40 bg-destructive/5 flex items-center justify-between gap-3 rounded-lg border p-4">
          <span className="text-sm">
            ⚠️ <strong>{vencidas}</strong> clase(s) sin cerrar hace más de 24 h.
          </span>
          <Link href="/cierre" className="text-sm font-medium underline">Ver pendientes</Link>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {esProfesor ? (
          <Kpi label="Mis próximas clases" value={proximas?.length ?? 0} />
        ) : (
          <>
            <Kpi label="Clientes activos" value={nClientes ?? 0} />
            <Kpi label="Profesores" value={nProfes ?? 0} />
            <Kpi label="Academias activas" value={nAcademias ?? 0} />
            {esFinanzas ? (
              <Kpi label="Conciliado este mes" value={COP.format(totalMes)} />
            ) : (
              <Kpi label="Próximas clases" value={proximas?.length ?? 0} />
            )}
          </>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Próximas clases</CardTitle>
        </CardHeader>
        <CardContent>
          {(proximas ?? []).length > 0 ? (
            <ul className="divide-y text-sm">
              {(proximas ?? []).map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2">
                  <span>
                    {c.fecha} {c.hora_inicio?.slice(0, 5) ?? ""} ·{" "}
                    {c.tipo === "academia" ? "Academia" : "Individual"}
                  </span>
                  {c.deporte && <Badge variant="outline">{c.deporte}</Badge>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">No hay clases próximas.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
