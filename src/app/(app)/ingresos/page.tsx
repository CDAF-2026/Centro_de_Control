import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Wallet } from "lucide-react";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const PAGE_SIZE = 20;

/** Detalle de ingresos (facturas de Siigo), del más reciente al más antiguo. */
export default async function IngresosPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireRole(rolesForModule("reportes_financieros"));
  const { page: pageRaw } = await searchParams;
  const page = Math.max(1, Number(pageRaw) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();
  const { data: facturas, count } = await supabase
    .from("siigo_facturas")
    .select("id, numero, fecha, cliente_id, cliente_nombre_siigo, total, saldo, estado_conciliacion", { count: "exact" })
    .order("fecha", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);

  const facIds = (facturas ?? []).map((f) => f.id);
  const cliIds = [...new Set((facturas ?? []).map((f) => f.cliente_id).filter((x): x is number => x != null))];
  const [{ data: lineas }, { data: servicios }, { data: clientes }] = await Promise.all([
    facIds.length
      ? supabase.from("siigo_factura_lineas").select("factura_id, descripcion, servicio_id, monto").in("factura_id", facIds)
      : Promise.resolve({ data: [] as { factura_id: number; descripcion: string | null; servicio_id: number | null; monto: number }[] }),
    supabase.from("servicios").select("id, nombre"),
    cliIds.length
      ? supabase.from("clientes").select("id, nombres, apellidos").in("id", cliIds)
      : Promise.resolve({ data: [] as { id: number; nombres: string; apellidos: string | null }[] }),
  ]);

  const svName = new Map((servicios ?? []).map((s) => [s.id, s.nombre]));
  const cliName = new Map((clientes ?? []).map((c) => [c.id, `${c.nombres} ${c.apellidos ?? ""}`.trim()]));
  const lineasByFac = new Map<number, { descripcion: string | null; servicio_id: number | null; monto: number }[]>();
  for (const l of lineas ?? []) {
    const a = lineasByFac.get(l.factura_id) ?? [];
    a.push(l);
    lineasByFac.set(l.factura_id, a);
  }
  /** Servicios distintos de la factura (etiquetas cortas para la columna Detalle). */
  const serviciosDe = (facId: number) => {
    const nombres = [...new Set((lineasByFac.get(facId) ?? []).map((l) => svName.get(l.servicio_id ?? -1) ?? "Sin categoría"))];
    return nombres;
  };

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const desde = total === 0 ? 0 : from + 1;
  const hasta = Math.min(from + PAGE_SIZE, total);
  const pageHref = (n: number) => (n > 1 ? `/ingresos?page=${n}` : "/ingresos");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard" className="text-muted-foreground text-sm hover:underline">
          ← Dashboard
        </Link>
        <h1 className="cdaf-headline mt-1">Ingresos · detalle</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Facturas de Siigo del más reciente al más antiguo. Se sincroniza automáticamente cada 20 minutos.
        </p>
      </div>

      {total === 0 ? (
        <EmptyState icon={Wallet} title="Sin ingresos registrados" description="Aún no hay facturas sincronizadas desde Siigo." />
      ) : (
        <>
          <div className="cdaf-table-wrap">
            <table className="cdaf-table">
              <thead>
                <tr>
                  <th className="px-4 py-2">Fecha</th>
                  <th className="px-4 py-2">Factura</th>
                  <th className="px-4 py-2">Cliente</th>
                  <th className="px-4 py-2">Detalle</th>
                  <th className="px-4 py-2 text-right">Pagado</th>
                </tr>
              </thead>
              <tbody>
                {(facturas ?? []).map((f) => {
                  const pagado = (f.total ?? 0) - (f.saldo ?? 0);
                  const svs = serviciosDe(f.id);
                  return (
                    <tr key={f.id} className="border-t">
                      <td className="px-4 py-2 whitespace-nowrap tabular-nums">{f.fecha}</td>
                      <td className="text-muted-foreground px-4 py-2 whitespace-nowrap">{f.numero ?? "—"}</td>
                      <td className="px-4 py-2">
                        {f.cliente_id ? (
                          <Link href={`/clientes/${f.cliente_id}`} className="font-medium hover:underline">
                            {cliName.get(f.cliente_id) ?? `Cliente #${f.cliente_id}`}
                          </Link>
                        ) : f.cliente_nombre_siigo ? (
                          f.cliente_nombre_siigo
                        ) : (
                          <span className="text-muted-foreground">Mostrador</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap items-center gap-1">
                          {svs.slice(0, 3).map((n) => (
                            <Badge key={n} variant="outline">{n}</Badge>
                          ))}
                          {svs.length > 3 && <span className="text-muted-foreground text-xs">+{svs.length - 3}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap tabular-nums">
                        <span className="font-medium">{COP.format(pagado)}</span>
                        {f.saldo > 0 && (
                          <span className="text-destructive block text-xs">Debe {COP.format(f.saldo)}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">
              {desde}–{hasta} de {total} · Página {page} de {totalPages}
            </span>
            <div className="flex items-center gap-2">
              {page > 1 ? (
                <Link href={pageHref(page - 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>← Anterior</Link>
              ) : (
                <span className={`${buttonVariants({ variant: "outline", size: "sm" })} pointer-events-none opacity-40`}>← Anterior</span>
              )}
              {page < totalPages ? (
                <Link href={pageHref(page + 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>Siguiente →</Link>
              ) : (
                <span className={`${buttonVariants({ variant: "outline", size: "sm" })} pointer-events-none opacity-40`}>Siguiente →</span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
