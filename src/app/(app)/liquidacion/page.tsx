import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Users } from "lucide-react";
import { calcularLiquidacion, rangoPeriodoLiq } from "@/lib/liquidacion";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const SELECT = "border-input bg-background h-9 rounded-md border px-3 text-sm";

function ymActual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function LiquidacionPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; ym?: string }>;
}) {
  await requireRole(rolesForModule("liquidacion"));
  const sp = await searchParams;
  const periodo = sp.periodo === "q1" || sp.periodo === "q2" ? sp.periodo : "mes";
  const ym = /^\d{4}-\d{2}$/.test(sp.ym ?? "") ? sp.ym! : ymActual();
  const { desde, hasta, quincenas } = rangoPeriodoLiq(periodo, ym);

  const filas = await calcularLiquidacion(desde, hasta, quincenas);
  const conMovim = filas.filter((f) => f.clases > 0 || f.total > 0);
  const totalGeneral = filas.reduce((s, f) => s + f.total, 0);
  const qs = `?periodo=${periodo}&ym=${ym}`;

  return (
    <div className="space-y-6">
      <h1 className="cdaf-headline">Liquidación de entrenadores</h1>

      <form className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="periodo">Periodo</Label>
          <select id="periodo" name="periodo" defaultValue={periodo} className={SELECT}>
            <option value="mes">Mes completo</option>
            <option value="q1">Quincena 1 (1–15)</option>
            <option value="q2">Quincena 2 (16–fin)</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ym">Mes</Label>
          <input id="ym" name="ym" type="month" defaultValue={ym} className={SELECT} />
        </div>
        <button type="submit" className={buttonVariants()}>Calcular</button>
      </form>

      <div className="cdaf-table-wrap">
        <table className="cdaf-table">
          <thead>
            <tr>
              <th className="px-4 py-2">Profesor</th>
              <th className="px-4 py-2">Tipo</th>
              <th className="px-4 py-2 text-right">Clases</th>
              <th className="px-4 py-2 text-right">Variable</th>
              <th className="px-4 py-2 text-right">Fijo / comisión</th>
              <th className="px-4 py-2 text-right">Total a liquidar</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {conMovim.map((f) => (
              <tr key={f.id}>
                <td className="px-4 py-2.5 font-medium">{f.nombre}</td>
                <td className="px-4 py-2.5"><Badge variant="outline">{f.tipoLabel}</Badge></td>
                <td className="px-4 py-2.5 text-right tabular-nums">{f.clases}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{COP.format(f.variable)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{COP.format(f.fijo + f.comision)}</td>
                <td className="px-4 py-2.5 text-right font-medium tabular-nums">{COP.format(f.total)}</td>
                <td className="px-4 py-2.5 text-right">
                  <Link href={`/liquidacion/${f.id}${qs}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    Ver detalle
                  </Link>
                </td>
              </tr>
            ))}
            {conMovim.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <EmptyState icon={Users} title="No hay nada que liquidar en el periodo" description="Solo se cuentan clases cerradas como realizadas." />
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 font-semibold">
              <td className="px-4 py-2.5" colSpan={5}>Total del periodo</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{COP.format(totalGeneral)}</td>
              <td className="px-4 py-2.5" />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-muted-foreground text-xs">
        Particular/paquete = <strong>% × valor facturado</strong> · academia = <strong>alumnos × tarifa del profesor</strong> ·
        físico = asistentes × pago. Los montos fijos se prorratean (quincena = mitad del mensual). Solo clases <strong>realizadas</strong>.
      </p>
    </div>
  );
}
