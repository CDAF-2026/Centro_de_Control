import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { CalendarCheck } from "lucide-react";
import { calcularLiquidacion, rangoPeriodoLiq } from "@/lib/liquidacion";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

function ymActual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function LiquidacionDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ periodo?: string; ym?: string }>;
}) {
  await requireRole(rolesForModule("liquidacion"));
  const { id } = await params;
  const sp = await searchParams;
  const periodo = sp.periodo === "q1" || sp.periodo === "q2" ? sp.periodo : "mes";
  const ym = /^\d{4}-\d{2}$/.test(sp.ym ?? "") ? sp.ym! : ymActual();
  const { desde, hasta, quincenas } = rangoPeriodoLiq(periodo, ym);

  const filas = await calcularLiquidacion(desde, hasta, quincenas);
  const prof = filas.find((f) => f.id === id);
  if (!prof) notFound();
  const qs = `?periodo=${periodo}&ym=${ym}`;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/liquidacion${qs}`} className="text-muted-foreground text-sm hover:underline">
          ← Liquidación
        </Link>
        <h1 className="cdaf-headline mt-1">{prof.nombre}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="outline">{prof.compLabel}</Badge>
          <span className="text-muted-foreground">
            {desde} a {hasta} · {prof.clases} clase(s)
          </span>
        </div>
      </div>

      <div className="cdaf-table-wrap">
        <table className="cdaf-table">
          <thead>
            <tr>
              <th className="px-3 py-2">Fecha clase</th>
              <th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2">Tipo de clase</th>
              <th className="px-3 py-2 text-right">Valor cobrado al cliente</th>
              <th className="px-3 py-2 text-right">Valor a pagar al profesor</th>
            </tr>
          </thead>
          <tbody>
            {prof.lineas.map((l) => (
              <tr key={`${l.tipoLabel}-${l.claseId}`}>
                <td className="px-3 py-2.5 tabular-nums">
                  {l.fecha}
                  {l.hora ? ` ${l.hora.slice(0, 5)}` : ""}
                </td>
                <td className="px-3 py-2.5">{l.detalle}</td>
                <td className="px-3 py-2.5">{l.tipoLabel}</td>
                {/* Academia llega en null: su ingreso sale de Siigo, no de un precio interno.
                    Se muestra "—" y no $ 0, que se leería como "no se le cobró nada". */}
                <td className="text-muted-foreground px-3 py-2.5 text-right tabular-nums">
                  {l.valorFacturado === null ? "—" : COP.format(l.valorFacturado)}
                </td>
                <td className="px-3 py-2.5 text-right font-medium tabular-nums">{COP.format(l.valorProfesor)}</td>
              </tr>
            ))}
            {prof.lineas.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <EmptyState icon={CalendarCheck} title="Sin clases realizadas en el periodo" />
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t font-medium">
              <td className="px-3 py-2" colSpan={3}>Variable (clases)</td>
              <td className="px-3 py-2 text-right tabular-nums">{COP.format(prof.facturado)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{COP.format(prof.variable)}</td>
            </tr>
            {prof.fijo > 0 && (
              <tr className="font-medium">
                <td className="px-3 py-1" colSpan={4}>Salario fijo</td>
                <td className="px-3 py-1 text-right tabular-nums">{COP.format(prof.fijo)}</td>
              </tr>
            )}
            {prof.comision > 0 && (
              <tr className="font-medium">
                <td className="px-3 py-1" colSpan={4}>Comisión quincenal</td>
                <td className="px-3 py-1 text-right tabular-nums">{COP.format(prof.comision)}</td>
              </tr>
            )}
            {prof.siigo > 0 && (
              <tr className="font-medium">
                <td className="px-3 py-1" colSpan={4}>Alto rendimiento (Siigo)</td>
                <td className="px-3 py-1 text-right tabular-nums">{COP.format(prof.siigo)}</td>
              </tr>
            )}
            {prof.eventos > 0 && (
              <tr className="font-medium">
                <td className="px-3 py-1" colSpan={4}>Eventos</td>
                <td className="px-3 py-1 text-right tabular-nums">{COP.format(prof.eventos)}</td>
              </tr>
            )}
            <tr className="border-t-2 font-semibold">
              <td className="px-3 py-2" colSpan={4}>Total a liquidar</td>
              <td className="px-3 py-2 text-right tabular-nums">{COP.format(prof.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-muted-foreground text-xs">
        <strong>Valor cobrado al cliente</strong> = lo facturado por esa clase (o la base de Siigo en alto rendimiento).{" "}
        <strong>Valor a pagar al profesor</strong> = según sus reglas de compensación. Solo clases realizadas; el alto
        rendimiento sale de la facturación de Siigo del periodo. Las clases de <strong>academia</strong> aparecen con
        &ldquo;—&rdquo; en lo cobrado: la academia se factura por mensualidad en Siigo, no por clase, así que no hay un
        valor por clase que mostrar aquí.
      </p>
    </div>
  );
}
