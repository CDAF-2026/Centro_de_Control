import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Wallet } from "lucide-react";
import { rangoPeriodo, parsePeriodo } from "@/lib/periodo";
import { PeriodoToggle } from "../dashboard/periodo-toggle";
import { FiltroServicio } from "./filtro-servicio";
import { cn } from "@/lib/utils";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const PAGE_SIZE = 20;

type FacturaRow = {
  id: number;
  numero: string | null;
  fecha: string;
  cliente_id: number | null;
  cliente_nombre_siigo: string | null;
  total: number;
  saldo: number;
  nota_credito: number;
  nc_numero: string | null;
};

/** Detalle de ingresos (facturas de Siigo), del más reciente al más antiguo. */
export default async function IngresosPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; servicio?: string; periodo?: string; desde?: string; hasta?: string }>;
}) {
  await requireRole(rolesForModule("reportes_financieros"));
  const { page: pageRaw, servicio: servicioRaw, periodo: periodoRaw, desde: desdeQ, hasta: hastaQ } = await searchParams;
  const page = Math.max(1, Number(pageRaw) || 1);
  const servicioId = Number(servicioRaw) || 0;
  const periodo = parsePeriodo(periodoRaw);
  const { curStartIso, curEndIso } = rangoPeriodo(periodo, new Date(), desdeQ, hastaQ);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();
  // Con filtro: solo facturas que tengan al menos una línea de ese servicio (join interno).
  const sel =
    "id, numero, fecha, cliente_id, cliente_nombre_siigo, total, saldo, nota_credito, nc_numero" +
    (servicioId ? ", siigo_factura_lineas!inner(servicio_id)" : "");
  let query = supabase
    .from("siigo_facturas")
    .select(sel, { count: "exact" })
    .gte("fecha", curStartIso)
    .lte("fecha", curEndIso);
  if (servicioId) query = query.eq("siigo_factura_lineas.servicio_id", servicioId);
  const { data: facturasRaw, count } = await query
    .order("fecha", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);
  const facturas = (facturasRaw ?? []) as unknown as FacturaRow[];

  const facIds = (facturas ?? []).map((f) => f.id);
  const cliIds = [...new Set((facturas ?? []).map((f) => f.cliente_id).filter((x): x is number => x != null))];
  const [{ data: lineas }, { data: servicios }, { data: clientes }, ingresoRes] = await Promise.all([
    facIds.length
      ? supabase.from("siigo_factura_lineas").select("factura_id, descripcion, servicio_id, monto").in("factura_id", facIds)
      : Promise.resolve({ data: [] as { factura_id: number; descripcion: string | null; servicio_id: number | null; monto: number }[] }),
    supabase.from("servicios").select("id, nombre").order("orden"),
    cliIds.length
      ? supabase.from("clientes").select("id, nombres, apellidos").in("id", cliIds)
      : Promise.resolve({ data: [] as { id: number; nombres: string; apellidos: string | null }[] }),
    supabase.rpc("siigo_ingreso_servicio", { p_desde: curStartIso, p_hasta: curEndIso }),
  ]);

  // Total de ingresos (porción pagada) del periodo observado, según el filtro.
  const totalPeriodo = servicioId
    ? Number((ingresoRes.data ?? []).find((r) => r.servicio_id === servicioId)?.monto ?? 0)
    : (ingresoRes.data ?? []).reduce((s, r) => s + Number(r.monto), 0);

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

  // Params del periodo (se conservan al filtrar, paginar o cambiar de periodo).
  const periodoParams: Record<string, string> = { periodo };
  if (periodo === "custom") {
    if (desdeQ) periodoParams.desde = desdeQ;
    if (hastaQ) periodoParams.hasta = hastaQ;
  }
  const pageHref = (n: number) => {
    const p = new URLSearchParams(periodoParams);
    if (servicioId) p.set("servicio", String(servicioId));
    if (n > 1) p.set("page", String(n));
    return `/ingresos?${p.toString()}`;
  };

  const PERIODO_LABEL: Record<string, string> = { semana: "Semana", mes: "Mes", "3m": "3 meses", custom: "Personalizado" };
  const filtroNombre = servicioId ? svName.get(servicioId) ?? "Servicio" : "Todos los servicios";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard" className="text-muted-foreground text-sm hover:underline">
          ← Dashboard
        </Link>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="cdaf-headline">Ingresos · detalle</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Facturas de Siigo del más reciente al más antiguo. Se sincroniza automáticamente cada 20 minutos.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PeriodoToggle
              periodo={periodo}
              desde={desdeQ}
              hasta={hastaQ}
              basePath="/ingresos"
              extra={servicioId ? { servicio: String(servicioId) } : {}}
            />
            <FiltroServicio
              servicios={servicios ?? []}
              value={servicioId ? String(servicioId) : ""}
              basePath="/ingresos"
              extra={periodoParams}
            />
          </div>
        </div>
      </div>

      {/* Total del periodo observado según el filtro */}
      <div className="bg-card ring-foreground/[0.06] flex flex-wrap items-baseline justify-between gap-2 rounded-xl p-4 shadow-sm ring-1">
        <span className="text-muted-foreground text-sm">
          Ingresos · <strong className="text-foreground">{filtroNombre}</strong> · {PERIODO_LABEL[periodo]} ({curStartIso} → {curEndIso})
        </span>
        <span className="font-heading text-2xl font-semibold tracking-tight tabular-nums">{COP.format(totalPeriodo)}</span>
      </div>

      {total === 0 ? (
        <EmptyState
          icon={Wallet}
          title={servicioId ? "Sin ingresos de este servicio en el periodo" : "Sin ingresos en el periodo"}
          description={servicioId ? "Prueba con otro servicio, otro periodo o quita el filtro." : "Prueba con otro periodo."}
        />
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
                  const nc = f.nota_credito ?? 0;
                  const anulada = nc > 0 && nc >= (f.total ?? 0);
                  const pagado = Math.max((f.total ?? 0) - (f.saldo ?? 0) - nc, 0);
                  const svs = serviciosDe(f.id);
                  return (
                    <tr key={f.id} className={cn("border-t", anulada && "text-muted-foreground/70")}>
                      <td className="px-4 py-2 whitespace-nowrap tabular-nums">{f.fecha}</td>
                      <td className="text-muted-foreground px-4 py-2 whitespace-nowrap">
                        <span className={cn(anulada && "line-through")}>{f.numero ?? "—"}</span>
                        {nc > 0 && (
                          <span
                            className="border-destructive/30 text-destructive ml-2 cursor-help rounded border px-1.5 py-0.5 text-[10px] font-medium"
                            title={`Anulada con nota crédito ${f.nc_numero ?? ""} por ${COP.format(nc)}. No cuenta como ingreso.`}
                          >
                            {anulada ? "Anulada" : "NC parcial"}
                          </span>
                        )}
                      </td>
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
                        <span className={cn("font-medium", anulada && "line-through")}>{COP.format(pagado)}</span>
                        {nc > 0 && (
                          <span className="text-muted-foreground block text-xs">
                            Nota crédito {f.nc_numero ?? ""} · −{COP.format(nc)}
                          </span>
                        )}
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
