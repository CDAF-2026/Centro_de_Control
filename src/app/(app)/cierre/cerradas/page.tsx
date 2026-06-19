import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buttonVariants } from "@/components/ui/button";
import { ReabrirButton } from "./reabrir-button";
import { EmptyState } from "@/components/ui/empty-state";
import { ClipboardCheck } from "lucide-react";

const EST: Record<string, { label: string; variant: "secondary" | "outline" | "destructive" }> = {
  realizada: { label: "Realizada", variant: "secondary" },
  cancelada: { label: "Cancelada", variant: "outline" },
  no_show: { label: "No-show", variant: "destructive" },
};

export default async function ClasesCerradasPage({
  searchParams,
}: {
  searchParams: Promise<{ profesor?: string; desde?: string; hasta?: string }>;
}) {
  await requireRole(["superadmin"]);
  const sp = await searchParams;
  const profesorId = sp.profesor || "";
  const desde = sp.desde || "";
  const hasta = sp.hasta || "";

  const supabase = await createClient();

  const { data: profesores } = await supabase
    .from("profiles")
    .select("id, nombre")
    .eq("role", "profesor")
    .order("nombre");

  let q = supabase
    .from("clases")
    .select("id, fecha, hora_inicio, deporte, tipo, estado, profesor_id, cliente_id, academia_id, paquete_cliente_id")
    .in("estado", ["realizada", "cancelada", "no_show"])
    .order("fecha", { ascending: false })
    .limit(100);
  if (profesorId) q = q.eq("profesor_id", profesorId);
  if (desde) q = q.gte("fecha", desde);
  if (hasta) q = q.lte("fecha", hasta);
  const { data: clases } = await q;
  const lista = clases ?? [];

  const profIds = [...new Set(lista.map((c) => c.profesor_id).filter((x): x is string => !!x))];
  const cliIds = [...new Set(lista.map((c) => c.cliente_id).filter((x): x is number => x != null))];
  const acaIds = [...new Set(lista.map((c) => c.academia_id).filter((x): x is number => x != null))];
  const profName = new Map<string, string>((profesores ?? []).map((p) => [p.id, p.nombre ?? "—"]));
  const cliName = new Map<number, string>();
  if (cliIds.length) {
    const { data } = await supabase.from("clientes").select("id, nombres, apellidos").in("id", cliIds);
    for (const c of data ?? []) cliName.set(c.id, `${c.apellidos}, ${c.nombres}`);
  }
  const acaName = new Map<number, string>();
  if (acaIds.length) {
    const { data } = await supabase.from("academias").select("id, nombre").in("id", acaIds);
    for (const a of data ?? []) acaName.set(a.id, a.nombre);
  }
  // profesores que aparecen pero no estaban en el mapa (por si acaso)
  for (const id of profIds) if (!profName.has(id)) profName.set(id, "—");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/cierre" className="text-muted-foreground text-sm hover:underline">← Clases por cerrar</Link>
        <h1 className="cdaf-headline mt-1">Clases cerradas · gestión</h1>
        <p className="text-muted-foreground text-sm">
          Deshaz el cierre de una clase para que vuelva a pendientes (p. ej. cuando un profesor no pudo
          cerrarla a tiempo). Si la clase consumió un paquete, el saldo se restaura.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="profesor">Profesor</Label>
          <select id="profesor" name="profesor" defaultValue={profesorId} className="border-input bg-background h-9 rounded-md border px-3 text-sm">
            <option value="">Todos</option>
            {(profesores ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre ?? p.id}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="desde">Desde</Label>
          <Input id="desde" name="desde" type="date" defaultValue={desde} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="hasta">Hasta</Label>
          <Input id="hasta" name="hasta" type="date" defaultValue={hasta} />
        </div>
        <button type="submit" className={buttonVariants({ variant: "outline" })}>Filtrar</button>
      </form>

      <div className="cdaf-table-wrap">
        <table className="cdaf-table">
          <thead>
            <tr>
              <th className="px-3 py-2 font-semibold">Fecha</th>
              <th className="px-3 py-2 font-semibold">Profesor</th>
              <th className="px-3 py-2 font-semibold">Deportista</th>
              <th className="px-3 py-2 font-semibold">Tipo</th>
              <th className="px-3 py-2 font-semibold">Estado</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {lista.map((c) => {
              const est = EST[c.estado] ?? { label: c.estado, variant: "outline" as const };
              const tipo = c.paquete_cliente_id ? "Paquete" : c.tipo === "academia" ? "Academia" : "Particular";
              const quien = c.tipo === "academia"
                ? `Academia: ${c.academia_id ? acaName.get(c.academia_id) ?? "—" : "—"}`
                : c.cliente_id ? cliName.get(c.cliente_id) ?? "—" : "—";
              return (
                <tr key={c.id} className="border-t">
                  <td className="px-3 py-2 tabular-nums">{c.fecha} {c.hora_inicio?.slice(0, 5) ?? ""}</td>
                  <td className="px-3 py-2">{c.profesor_id ? profName.get(c.profesor_id) ?? "—" : "—"}</td>
                  <td className="px-3 py-2">{quien}{c.deporte ? <span className="text-muted-foreground"> · {c.deporte}</span> : null}</td>
                  <td className="px-3 py-2">{tipo}</td>
                  <td className="px-3 py-2"><Badge variant={est.variant}>{est.label}</Badge></td>
                  <td className="px-3 py-2 text-right"><ReabrirButton claseId={c.id} /></td>
                </tr>
              );
            })}
            {lista.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <EmptyState icon={ClipboardCheck} title="No hay clases cerradas" description="Prueba quitar los filtros." />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-muted-foreground text-xs">Mostrando las 100 más recientes. Usa los filtros para acotar.</p>
    </div>
  );
}
