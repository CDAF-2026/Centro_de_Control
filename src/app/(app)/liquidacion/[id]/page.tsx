import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

function horasClase(ini: string | null, fin: string | null): number {
  if (!ini || !fin) return 1;
  const [h1, m1] = ini.split(":").map(Number);
  const [h2, m2] = fin.split(":").map(Number);
  const mins = (h2 * 60 + (m2 || 0)) - (h1 * 60 + (m1 || 0));
  return mins > 0 ? mins / 60 : 1;
}

function rangoMesActual() {
  const now = new Date();
  return {
    desde: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
    hasta: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
  };
}

const TIPO_VARIANT: Record<string, "secondary" | "outline" | "default"> = {
  Paquete: "default",
  Particular: "secondary",
  Libre: "outline",
};

export default async function LiquidacionDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ desde?: string; hasta?: string; todas?: string }>;
}) {
  await requireRole(rolesForModule("liquidacion"));
  const { id } = await params;
  const sp = await searchParams;
  const def = rangoMesActual();
  const desde = sp.desde || def.desde;
  const hasta = sp.hasta || def.hasta;
  const todas = sp.todas === "1";

  const supabase = await createClient();
  const { data: profe } = await supabase.from("profiles").select("id, nombre").eq("id", id).maybeSingle();
  const { data: valores } = await supabase
    .from("profesor_valor_clase")
    .select("valor, vigente_desde")
    .eq("profesor_id", id)
    .order("vigente_desde", { ascending: false })
    .limit(1);
  const valorHora = valores?.[0]?.valor ?? 0;

  let q = supabase
    .from("clases")
    .select("id, fecha, hora_inicio, hora_fin, tipo, deporte, cancha, cliente_id, academia_id, paquete_cliente_id")
    .eq("profesor_id", id)
    .eq("estado", "realizada")
    .order("fecha", { ascending: false });
  if (!todas) q = q.gte("fecha", desde).lte("fecha", hasta);
  const { data: clases } = await q;
  const lista = clases ?? [];

  const cliIds = [...new Set(lista.map((c) => c.cliente_id).filter((x): x is number => x != null))];
  const acaIds = [...new Set(lista.map((c) => c.academia_id).filter((x): x is number => x != null))];
  const cliName = new Map<number, string>();
  if (cliIds.length) {
    const { data } = await supabase.from("clientes").select("id, nombres, apellidos").in("id", cliIds);
    for (const c of data ?? []) cliName.set(c.id, `${c.nombres} ${c.apellidos}`);
  }
  const acaName = new Map<number, string>();
  if (acaIds.length) {
    const { data } = await supabase.from("academias").select("id, nombre").in("id", acaIds);
    for (const a of data ?? []) acaName.set(a.id, a.nombre);
  }

  const filas = lista.map((c) => {
    const horas = horasClase(c.hora_inicio, c.hora_fin);
    const tipo = c.paquete_cliente_id ? "Paquete" : c.tipo === "individual" && c.cliente_id ? "Particular" : "Libre";
    const cliente =
      c.tipo === "academia"
        ? `Academia: ${c.academia_id ? acaName.get(c.academia_id) ?? "—" : "—"}`
        : c.cliente_id ? cliName.get(c.cliente_id) ?? "—" : "—";
    return {
      id: c.id,
      fecha: c.fecha,
      hora: `${c.hora_inicio?.slice(0, 5) ?? ""}${c.hora_fin ? `–${c.hora_fin.slice(0, 5)}` : ""}`,
      horas,
      tipo,
      cliente,
      deporte: c.deporte ?? "—",
      cancha: c.cancha ?? "—",
      valor: horas * valorHora,
    };
  });
  const totalHoras = filas.reduce((s, f) => s + f.horas, 0);
  const total = filas.reduce((s, f) => s + f.valor, 0);

  const qsRange = `?desde=${desde}&hasta=${hasta}`;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/liquidacion${qsRange}`} className="text-muted-foreground text-sm hover:underline">
          ← Liquidación
        </Link>
        <h1 className="cdaf-headline mt-1">{profe?.nombre ?? "Profesor"}</h1>
        <p className="text-muted-foreground text-sm">
          Valor/hora: <strong>{COP.format(valorHora)}</strong> · {todas ? "Todas las clases cerradas" : "Periodo seleccionado"}
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <form className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="desde">Desde</Label>
            <Input id="desde" name="desde" type="date" defaultValue={desde} disabled={todas} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hasta">Hasta</Label>
            <Input id="hasta" name="hasta" type="date" defaultValue={hasta} disabled={todas} />
          </div>
          <button type="submit" className={buttonVariants()} disabled={todas}>Calcular</button>
        </form>
        {todas ? (
          <Link href={`/liquidacion/${id}${qsRange}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Ver por periodo
          </Link>
        ) : (
          <Link href={`/liquidacion/${id}?todas=1`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Ver todas las clases cerradas
          </Link>
        )}
      </div>

      <div className="cdaf-table-wrap">
        <table className="cdaf-table">
          <thead>
            <tr>
              <th className="px-3 py-2 font-semibold">Fecha</th>
              <th className="px-3 py-2 font-semibold">Hora</th>
              <th className="px-3 py-2 text-right font-semibold">Horas</th>
              <th className="px-3 py-2 font-semibold">Tipo</th>
              <th className="px-3 py-2 font-semibold">Cliente</th>
              <th className="px-3 py-2 font-semibold">Deporte</th>
              <th className="px-3 py-2 font-semibold">Cancha</th>
              <th className="px-3 py-2 text-right font-semibold">Valor</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id} className="border-t">
                <td className="px-3 py-2 tabular-nums">{f.fecha}</td>
                <td className="px-3 py-2 tabular-nums">{f.hora}</td>
                <td className="px-3 py-2 text-right tabular-nums">{f.horas.toLocaleString("es-CO", { maximumFractionDigits: 1 })}</td>
                <td className="px-3 py-2"><Badge variant={TIPO_VARIANT[f.tipo]}>{f.tipo}</Badge></td>
                <td className="px-3 py-2">{f.cliente}</td>
                <td className="px-3 py-2 capitalize">{f.deporte}</td>
                <td className="px-3 py-2">{f.cancha}</td>
                <td className="px-3 py-2 text-right tabular-nums">{COP.format(f.valor)}</td>
              </tr>
            ))}
            {filas.length === 0 && (
              <tr>
                <td colSpan={8} className="text-muted-foreground px-3 py-6 text-center">
                  No hay clases cerradas {todas ? "" : "en este periodo"}.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 font-semibold">
              <td className="px-3 py-2" colSpan={2}>Total ({filas.length} clases)</td>
              <td className="px-3 py-2 text-right tabular-nums">{totalHoras.toLocaleString("es-CO", { maximumFractionDigits: 1 })}</td>
              <td className="px-3 py-2" colSpan={4} />
              <td className="px-3 py-2 text-right tabular-nums">{COP.format(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
