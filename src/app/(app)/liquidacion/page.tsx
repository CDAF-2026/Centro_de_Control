import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { Label } from "@/components/ui/label";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Users, CalendarClock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
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

  // Clases por cerrar (viene del dashboard): se muestra aquí porque una clase sin
  // cerrar no entra en la liquidación, así que conviene verlo antes de calcular.
  const supabase = await createClient();
  const hoy = new Date();
  const hoyIso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
  const [filas, { data: pendientes }] = await Promise.all([
    calcularLiquidacion(desde, hasta, quincenas),
    supabase.from("clases").select("fecha, hora_inicio").eq("estado", "programada").lte("fecha", hoyIso),
  ]);
  const ahoraMs = hoy.getTime();
  const porCerrar = (pendientes ?? []).length;
  const vencidas = (pendientes ?? []).filter(
    (c) => ahoraMs > new Date(`${c.fecha}T${c.hora_inicio ?? "23:59"}:00`).getTime() + 24 * 3600 * 1000,
  ).length;
  const conMovim = filas.filter((f) => f.clases > 0 || f.total > 0);
  const facturadoGeneral = filas.reduce((s, f) => s + f.facturado, 0);
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

        {/* Clases por cerrar: enlaza al cierre, porque lo no cerrado no se liquida. */}
        <Link
          href={vencidas > 0 ? "/cierre/vencidas" : "/cierre"}
          className="bg-card hover:bg-muted/40 flex items-center gap-3 rounded-xl border p-2.5 shadow-sm transition-colors"
        >
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg",
              vencidas > 0 ? "bg-warning/15 text-[#8a5600]" : "bg-muted text-muted-foreground",
            )}
          >
            <CalendarClock className="size-4.5" />
          </span>
          <span className="leading-tight">
            <span className="font-heading block text-xl font-bold tracking-tight tabular-nums">{porCerrar}</span>
            <span className="text-muted-foreground text-xs">
              Clases por cerrar{vencidas > 0 ? ` · ${vencidas} vencidas` : ""}
            </span>
          </span>
        </Link>
      </form>

      <div className="cdaf-table-wrap">
        <table className="cdaf-table">
          <thead>
            <tr>
              <th className="px-4 py-2">Profesor</th>
              <th className="px-4 py-2 text-right">Valor facturado</th>
              <th className="px-4 py-2 text-right">Total a liquidar</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {conMovim.map((f) => (
              <tr key={f.id}>
                <td className="px-4 py-2.5">
                  <span className="font-medium">{f.nombre}</span>
                  <span className="text-muted-foreground block text-xs">{f.compLabel} · {f.clases} clase(s)</span>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{COP.format(f.facturado)}</td>
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
                <td colSpan={4}>
                  <EmptyState icon={Users} title="No hay nada que liquidar en el periodo" description="Solo se cuentan clases cerradas como realizadas." />
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 font-semibold">
              <td className="px-4 py-2.5">Total del periodo</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{COP.format(facturadoGeneral)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{COP.format(totalGeneral)}</td>
              <td className="px-4 py-2.5" />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-muted-foreground text-xs">
        <strong>Valor facturado</strong> = total cobrado a clientes. <strong>Total a liquidar</strong> = a pagar al profesor
        según su compensación. Solo clases <strong>realizadas</strong>; montos fijos prorrateados (quincena = mitad del mensual).
      </p>
    </div>
  );
}
