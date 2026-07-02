import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CircleCheck } from "lucide-react";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const PAGE_SIZE = 20;

/** Detalle de la cartera: facturas de Siigo con saldo pendiente ("Debe"), recientes primero. */
export default async function CarteraPage({
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
  const [{ data: facturas, count }, { data: saldos }] = await Promise.all([
    supabase
      .from("siigo_facturas")
      .select("id, numero, fecha, cliente_id, cliente_identificacion, cliente_nombre_siigo, total, saldo", { count: "exact" })
      .gt("saldo", 0)
      .order("fecha", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to),
    supabase.from("siigo_facturas").select("saldo").gt("saldo", 0),
  ]);
  const carteraTotal = (saldos ?? []).reduce((s, f) => s + (f.saldo ?? 0), 0);

  const facIds = (facturas ?? []).map((f) => f.id);
  const cliIds = [...new Set((facturas ?? []).map((f) => f.cliente_id).filter((x): x is number => x != null))];
  const [{ data: lineas }, { data: servicios }, { data: clientes }] = await Promise.all([
    facIds.length
      ? supabase.from("siigo_factura_lineas").select("factura_id, servicio_id").in("factura_id", facIds)
      : Promise.resolve({ data: [] as { factura_id: number; servicio_id: number | null }[] }),
    supabase.from("servicios").select("id, nombre"),
    cliIds.length
      ? supabase.from("clientes").select("id, nombres, apellidos").in("id", cliIds)
      : Promise.resolve({ data: [] as { id: number; nombres: string; apellidos: string | null }[] }),
  ]);

  const svName = new Map((servicios ?? []).map((s) => [s.id, s.nombre]));
  const cliName = new Map((clientes ?? []).map((c) => [c.id, `${c.nombres} ${c.apellidos ?? ""}`.trim()]));
  const svsByFac = new Map<number, string[]>();
  for (const l of lineas ?? []) {
    const nombre = svName.get(l.servicio_id ?? -1) ?? "Sin categoría";
    const a = svsByFac.get(l.factura_id) ?? [];
    if (!a.includes(nombre)) a.push(nombre);
    svsByFac.set(l.factura_id, a);
  }

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const desde = total === 0 ? 0 : from + 1;
  const hasta = Math.min(from + PAGE_SIZE, total);
  const pageHref = (n: number) => (n > 1 ? `/cartera?page=${n}` : "/cartera");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard" className="text-muted-foreground text-sm hover:underline">
          ← Dashboard
        </Link>
        <h1 className="cdaf-headline mt-1">Cartera por cobrar</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Facturas de Siigo con saldo pendiente, de la más reciente a la más antigua ·{" "}
          <strong className="text-foreground">{COP.format(carteraTotal)}</strong> en {total} factura(s).
          Las que no tienen cliente se asignan en la <Link href="/pagos" className="underline">Bolsa de pagos</Link>.
        </p>
      </div>

      {total === 0 ? (
        <EmptyState icon={CircleCheck} title="Sin cartera pendiente" description="Ninguna factura tiene saldo por cobrar. ¡Todo al día!" />
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
                  <th className="px-4 py-2 text-right">Total</th>
                  <th className="px-4 py-2 text-right">Debe</th>
                </tr>
              </thead>
              <tbody>
                {(facturas ?? []).map((f) => {
                  const svs = svsByFac.get(f.id) ?? [];
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
                          <span className="text-muted-foreground">Sin identificar · NIT {f.cliente_identificacion ?? "—"}</span>
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
                      <td className="text-muted-foreground px-4 py-2 text-right whitespace-nowrap tabular-nums">
                        {COP.format(f.total)}
                      </td>
                      <td className="text-destructive px-4 py-2 text-right font-medium whitespace-nowrap tabular-nums">
                        {COP.format(f.saldo)}
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
