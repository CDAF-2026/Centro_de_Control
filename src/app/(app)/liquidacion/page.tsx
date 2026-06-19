import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Users } from "lucide-react";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

/** Horas de una clase a partir de hora_inicio/hora_fin (HH:MM[:SS]). Default 1h. */
export function horasClase(ini: string | null, fin: string | null): number {
  if (!ini || !fin) return 1;
  const [h1, m1] = ini.split(":").map(Number);
  const [h2, m2] = fin.split(":").map(Number);
  const mins = (h2 * 60 + (m2 || 0)) - (h1 * 60 + (m1 || 0));
  return mins > 0 ? mins / 60 : 1;
}

function rangoMesActual() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  return {
    desde: new Date(y, m, 1).toISOString().slice(0, 10),
    hasta: new Date(y, m + 1, 0).toISOString().slice(0, 10),
  };
}

export default async function LiquidacionPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  await requireRole(rolesForModule("liquidacion"));
  const sp = await searchParams;
  const def = rangoMesActual();
  const desde = sp.desde || def.desde;
  const hasta = sp.hasta || def.hasta;

  const supabase = await createClient();
  const { data: profesores } = await supabase
    .from("profiles")
    .select("id, nombre")
    .eq("role", "profesor")
    .order("nombre");

  const { data: valores } = await supabase
    .from("profesor_valor_clase")
    .select("profesor_id, valor, vigente_desde")
    .order("vigente_desde", { ascending: false });
  const valorPorProfesor = new Map<string, number>();
  for (const v of valores ?? []) {
    if (!valorPorProfesor.has(v.profesor_id)) valorPorProfesor.set(v.profesor_id, v.valor);
  }

  // "Lo que no está marcado no se paga": solo clases realizadas.
  const { data: realizadas } = await supabase
    .from("clases")
    .select("profesor_id, hora_inicio, hora_fin")
    .eq("estado", "realizada")
    .gte("fecha", desde)
    .lte("fecha", hasta);
  const conteo = new Map<string, { clases: number; horas: number }>();
  for (const c of realizadas ?? []) {
    if (!c.profesor_id) continue;
    const acc = conteo.get(c.profesor_id) ?? { clases: 0, horas: 0 };
    acc.clases += 1;
    acc.horas += horasClase(c.hora_inicio, c.hora_fin);
    conteo.set(c.profesor_id, acc);
  }

  const filas = (profesores ?? []).map((p) => {
    const acc = conteo.get(p.id) ?? { clases: 0, horas: 0 };
    const valor = valorPorProfesor.get(p.id) ?? 0;
    return { id: p.id, nombre: p.nombre ?? "—", clases: acc.clases, horas: acc.horas, valor, total: acc.horas * valor };
  });
  const totalGeneral = filas.reduce((s, f) => s + f.total, 0);
  const qs = `?desde=${desde}&hasta=${hasta}`;

  return (
    <div className="space-y-6">
      <h1 className="cdaf-headline">Liquidación de entrenadores</h1>

      <form className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="desde">Desde</Label>
          <Input id="desde" name="desde" type="date" defaultValue={desde} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="hasta">Hasta</Label>
          <Input id="hasta" name="hasta" type="date" defaultValue={hasta} />
        </div>
        <button type="submit" className={buttonVariants()}>Calcular</button>
      </form>

      <div className="cdaf-table-wrap">
        <table className="cdaf-table">
          <thead>
            <tr>
              <th className="px-4 py-2 font-semibold">Profesor</th>
              <th className="px-4 py-2 text-right font-semibold">Clases</th>
              <th className="px-4 py-2 text-right font-semibold">Horas</th>
              <th className="px-4 py-2 text-right font-semibold">Valor/hora</th>
              <th className="px-4 py-2 text-right font-semibold">Total a liquidar</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id} className="border-t">
                <td className="px-4 py-2 font-medium">{f.nombre}</td>
                <td className="px-4 py-2 text-right">{f.clases}</td>
                <td className="px-4 py-2 text-right">{f.horas.toLocaleString("es-CO", { maximumFractionDigits: 1 })}</td>
                <td className="px-4 py-2 text-right">{COP.format(f.valor)}</td>
                <td className="px-4 py-2 text-right font-medium">{COP.format(f.total)}</td>
                <td className="px-4 py-2 text-right">
                  <Link href={`/liquidacion/${f.id}${qs}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    Ver detalle
                  </Link>
                </td>
              </tr>
            ))}
            {filas.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <EmptyState icon={Users} title="No hay profesores para liquidar" description="Cuando se cierren clases en el periodo, aparecerán aquí." />
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 font-semibold">
              <td className="px-4 py-2" colSpan={4}>Total del periodo</td>
              <td className="px-4 py-2 text-right">{COP.format(totalGeneral)}</td>
              <td className="px-4 py-2" />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-muted-foreground text-xs">
        Solo se cuentan clases <strong>registradas como realizadas</strong>. Total = horas × valor/hora vigente
        del profesor. Entra al detalle para ver cada clase.
      </p>
    </div>
  );
}
