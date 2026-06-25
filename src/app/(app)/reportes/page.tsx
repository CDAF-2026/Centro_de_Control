import { requireRole } from "@/lib/auth";
import { rolesForModule, can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const ESTADO_LABEL: Record<string, string> = {
  programada: "Programadas",
  realizada: "Realizadas",
  cancelada: "Canceladas",
  no_show: "No-show",
};

export default async function ReportesPage() {
  const profile = await requireRole(rolesForModule("reportes_operativos"));
  const supabase = await createClient();
  const verFinanzas = can(profile.role, "reportes_financieros", "read");

  // Operativo: clases por estado
  const { data: clases } = await supabase.from("clases").select("estado, deporte");
  const porEstado = new Map<string, number>();
  const porDeporte = new Map<string, number>();
  for (const c of clases ?? []) {
    porEstado.set(c.estado, (porEstado.get(c.estado) ?? 0) + 1);
    if (c.deporte) porDeporte.set(c.deporte, (porDeporte.get(c.deporte) ?? 0) + 1);
  }

  // CRM
  const [{ count: activos }, { count: retirados }, { count: academias }, { count: paquetes }] =
    await Promise.all([
      supabase.from("clientes").select("*", { count: "exact", head: true }).eq("estado", "activo"),
      supabase.from("clientes").select("*", { count: "exact", head: true }).eq("estado", "retirado"),
      supabase.from("academias").select("*", { count: "exact", head: true }),
      supabase.from("paquetes_catalogo").select("*", { count: "exact", head: true }),
    ]);

  // Financiero
  const porCentro = new Map<string, number>();
  let totalConciliado = 0;
  if (verFinanzas) {
    const { data: servicios } = await supabase.from("servicios").select("id, nombre");
    const nombreDe = new Map((servicios ?? []).map((s) => [s.id, s.nombre]));
    const { data: pagos } = await supabase.from("pagos").select("monto, servicio_id").eq("estado", "asignado");
    for (const p of pagos ?? []) {
      const nombre = nombreDe.get(p.servicio_id) ?? "—";
      porCentro.set(nombre, (porCentro.get(nombre) ?? 0) + p.monto);
      totalConciliado += p.monto;
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="cdaf-headline">Reportes</h1>

      {verFinanzas && (
        <Card>
          <CardHeader>
            <CardTitle>Financiero · conciliado por servicio</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <ul className="divide-y">
              {[...porCentro.entries()].map(([c, v]) => (
                <li key={c} className="flex justify-between py-2">
                  <span>{c}</span>
                  <span className="font-medium">{COP.format(v)}</span>
                </li>
              ))}
              {porCentro.size === 0 && <li className="text-muted-foreground py-2">Sin pagos conciliados.</li>}
            </ul>
            <p className="font-semibold">Total conciliado: {COP.format(totalConciliado)}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Operativo · clases</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {["programada", "realizada", "cancelada", "no_show"].map((e) => (
              <div key={e} className="flex justify-between">
                <span>{ESTADO_LABEL[e]}</span>
                <span className="font-medium">{porEstado.get(e) ?? 0}</span>
              </div>
            ))}
            <div className="mt-2 border-t pt-2">
              <p className="text-muted-foreground mb-1">Por deporte</p>
              <div className="flex justify-between"><span>Tenis</span><span>{porDeporte.get("tenis") ?? 0}</span></div>
              <div className="flex justify-between"><span>Pádel</span><span>{porDeporte.get("padel") ?? 0}</span></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>CRM</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex justify-between"><span>Clientes activos</span><span className="font-medium">{activos ?? 0}</span></div>
            <div className="flex justify-between"><span>Clientes retirados</span><span>{retirados ?? 0}</span></div>
            <div className="flex justify-between"><span>Academias</span><span>{academias ?? 0}</span></div>
            <div className="flex justify-between"><span>Paquetes en catálogo</span><span>{paquetes ?? 0}</span></div>
          </CardContent>
        </Card>
      </div>

      <p className="text-muted-foreground text-xs">
        Set fijo de reportes (Fase 1). Exportación CSV/PDF y constructor a la medida: fase posterior.
      </p>
    </div>
  );
}
