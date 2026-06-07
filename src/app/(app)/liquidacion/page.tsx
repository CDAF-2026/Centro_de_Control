import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buttonVariants } from "@/components/ui/button";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

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
    .select("profesor_id")
    .eq("estado", "realizada")
    .gte("fecha", desde)
    .lte("fecha", hasta);
  const conteo = new Map<string, number>();
  for (const c of realizadas ?? []) {
    if (c.profesor_id) conteo.set(c.profesor_id, (conteo.get(c.profesor_id) ?? 0) + 1);
  }

  const filas = (profesores ?? []).map((p) => {
    const clases = conteo.get(p.id) ?? 0;
    const valor = valorPorProfesor.get(p.id) ?? 0;
    return { id: p.id, nombre: p.nombre ?? "—", clases, valor, total: clases * valor };
  });
  const totalGeneral = filas.reduce((s, f) => s + f.total, 0);

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

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-4 py-2 font-semibold">Profesor</th>
              <th className="px-4 py-2 text-right font-semibold">Clases realizadas</th>
              <th className="px-4 py-2 text-right font-semibold">Valor/clase</th>
              <th className="px-4 py-2 text-right font-semibold">Total a liquidar</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id} className="border-t">
                <td className="px-4 py-2">{f.nombre}</td>
                <td className="px-4 py-2 text-right">{f.clases}</td>
                <td className="px-4 py-2 text-right">{COP.format(f.valor)}</td>
                <td className="px-4 py-2 text-right font-medium">{COP.format(f.total)}</td>
              </tr>
            ))}
            {filas.length === 0 && (
              <tr>
                <td colSpan={4} className="text-muted-foreground px-4 py-6 text-center">
                  No hay profesores.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 font-semibold">
              <td className="px-4 py-2" colSpan={3}>
                Total del periodo
              </td>
              <td className="px-4 py-2 text-right">{COP.format(totalGeneral)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-muted-foreground text-xs">
        Solo se cuentan clases <strong>registradas como realizadas</strong>. El valor es el vigente
        por profesor.
      </p>
    </div>
  );
}
