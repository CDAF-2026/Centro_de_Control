import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { rolesForModule, can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { Trophy } from "lucide-react";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const TIPO_LABEL: Record<string, string> = { torneo: "Torneo", clinica: "Clínica", masterclass: "Masterclass", otro: "Otro" };
const ESTADO_LABEL: Record<string, string> = { planeado: "Planeado", en_curso: "En curso", finalizado: "Finalizado", cancelado: "Cancelado" };

export default async function EventosPage() {
  const profile = await requireRole(rolesForModule("eventos"));
  const supabase = await createClient();

  // El P&G de TODOS los eventos en una sola llamada (RPC), no una consulta por fila.
  const [{ data: eventos }, pygRes] = await Promise.all([
    supabase
      .from("eventos")
      .select(
        "id, nombre, tipo, deporte, fecha_inicio, fecha_fin, estado, cerrado_el, cierre_ingreso, cierre_costo, cierre_utilidad",
      )
      .order("fecha_inicio", { ascending: false }),
    supabase.rpc("eventos_pyg", {}),
  ]);
  const puedeEditar = can(profile.role, "eventos", "edit");
  const pyg = new Map((pygRes.data ?? []).map((r) => [Number(r.evento_id), r]));

  const lista = (eventos ?? []).map((e) => {
    const vivo = pyg.get(e.id);
    const cerrado = e.cerrado_el != null;
    // Cerrado → manda el snapshot (es la cifra publicada en el dashboard).
    return {
      ...e,
      cerrado,
      ingreso: cerrado ? e.cierre_ingreso ?? 0 : Number(vivo?.ingreso_facturado ?? 0),
      costo: cerrado ? e.cierre_costo ?? 0 : Number(vivo?.costo_total ?? 0),
      utilidad: cerrado ? e.cierre_utilidad ?? 0 : Number(vivo?.utilidad ?? 0),
    };
  });
  const abiertosConPlata = lista.filter((e) => !e.cerrado && e.estado !== "cancelado" && e.ingreso > 0);
  const retenido = abiertosConPlata.reduce((s, e) => s + e.ingreso, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="cdaf-headline">Eventos</h1>
        {puedeEditar && (
          <Link href="/eventos/nuevo" className={buttonVariants({ size: "sm" })}>Nuevo evento</Link>
        )}
      </div>
      <p className="text-muted-foreground text-sm">
        Torneos, clínicas y masterclass. Cada evento lleva su propio resultado (ingresos facturados − gastos −
        pago a profesores) y solo entra al dashboard —por su utilidad, no por el bruto— cuando se cierra.
      </p>

      {retenido > 0 && (
        <p className="border-warning/40 bg-warning/10 rounded-md border px-3 py-2 text-sm">
          <strong className="tabular-nums">{COP.format(retenido)}</strong> facturados en{" "}
          {abiertosConPlata.length} evento(s) sin cerrar: esa plata todavía no se ve en el dashboard.
        </p>
      )}

      {lista.length > 0 ? (
        <div className="cdaf-table-wrap">
          <table className="cdaf-table">
            <thead>
              <tr>
                <th className="px-4 py-2">Evento</th>
                <th className="px-4 py-2">Tipo</th>
                <th className="px-4 py-2">Fecha</th>
                <th className="px-4 py-2 text-right">Ingresos</th>
                <th className="px-4 py-2 text-right">Costos</th>
                <th className="px-4 py-2 text-right">Utilidad</th>
                <th className="px-4 py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((e) => (
                <tr key={e.id} className="border-t">
                  <td className="px-4 py-2">
                    <Link href={`/eventos/${e.id}`} className="font-medium hover:underline">{e.nombre}</Link>
                    {e.deporte && <span className="text-muted-foreground"> · {e.deporte}</span>}
                  </td>
                  <td className="px-4 py-2">{TIPO_LABEL[e.tipo] ?? e.tipo}</td>
                  <td className="px-4 py-2 tabular-nums">
                    {e.fecha_inicio}
                    {e.fecha_fin ? ` → ${e.fecha_fin}` : ""}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{COP.format(e.ingreso)}</td>
                  <td className="text-muted-foreground px-4 py-2 text-right tabular-nums">
                    {e.costo > 0 ? `−${COP.format(e.costo)}` : "—"}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-2 text-right font-medium tabular-nums",
                      e.utilidad < 0 && "text-destructive",
                    )}
                  >
                    {e.ingreso === 0 && e.costo === 0 ? "—" : COP.format(e.utilidad)}
                  </td>
                  <td className="px-4 py-2">
                    {e.cerrado ? (
                      <Badge variant="success">Cerrado</Badge>
                    ) : (
                      <Badge variant="outline">{ESTADO_LABEL[e.estado] ?? e.estado}</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={Trophy} title="Sin eventos" description="Crea el primer torneo, clínica o masterclass." />
      )}
    </div>
  );
}
