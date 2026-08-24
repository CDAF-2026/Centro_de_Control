import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { rolesForModule, can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CircleCheck, Clock, AlertTriangle, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { FiltroServicio } from "../ingresos/filtro-servicio";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const PAGE_SIZE = 20;

type FacturaRow = {
  id: number;
  numero: string | null;
  fecha: string;
  cliente_id: number | null;
  cliente_identificacion: string | null;
  cliente_nombre_siigo: string | null;
  total: number;
  saldo: number;
};

type Tramo = { tramo: string; n: number; total: number; desde: string | null; hasta: string | null };

/**
 * Los tres tramos de antigüedad. El orden importa: es el que se pinta.
 * ⚠️ "Espera" y no "vencida": se cuenta desde la FECHA DE LA FACTURA, porque
 * Siigo no expone fecha de vencimiento ni plazo (verificado contra su API).
 */
const TRAMOS = [
  { key: "0_30", label: "Hasta 30 días", icon: Clock, tono: "ok" as const },
  { key: "31_60", label: "31 a 60 días", icon: AlertTriangle, tono: "aviso" as const },
  { key: "60_mas", label: "Más de 60 días", icon: TriangleAlert, tono: "alerta" as const },
];

/** Días entre dos fechas 'YYYY-MM-DD', sin que la zona horaria mueva el resultado. */
function diasEntre(desde: string, hasta: string): number {
  const d = Date.UTC(+desde.slice(0, 4), +desde.slice(5, 7) - 1, +desde.slice(8, 10));
  const h = Date.UTC(+hasta.slice(0, 4), +hasta.slice(5, 7) - 1, +hasta.slice(8, 10));
  return Math.round((h - d) / 86400000);
}

/** Suma días a una fecha 'YYYY-MM-DD' y devuelve otra 'YYYY-MM-DD'. */
function masDias(fecha: string, dias: number): string {
  const t = Date.UTC(+fecha.slice(0, 4), +fecha.slice(5, 7) - 1, +fecha.slice(8, 10)) + dias * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Detalle de la cartera: facturas de Siigo con saldo pendiente ("Debe"), recientes primero. */
export default async function CarteraPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; servicio?: string; tramo?: string }>;
}) {
  const profile = await requireRole(rolesForModule("cartera"));
  const { page: pageRaw, servicio: servicioRaw, tramo: tramoRaw } = await searchParams;
  const page = Math.max(1, Number(pageRaw) || 1);
  const servicioId = Number(servicioRaw) || 0;
  const tramoSel = TRAMOS.some((t) => t.key === tramoRaw) ? tramoRaw! : null;
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();

  // Antigüedad en SQL (regla 2): agregar en JS obligaría a traer todas las
  // facturas pendientes, y PostgREST corta en 1.000 — el total se desinflaría
  // en silencio el día que la cartera crezca.
  const { data: tramosRaw } = await supabase.rpc("siigo_cartera_antiguedad", {
    p_servicio: servicioId || null,
  });
  const tramos = (tramosRaw ?? []) as Tramo[];
  const porTramo = new Map(tramos.map((t) => [t.tramo, t]));
  const carteraTotal = tramos.reduce((s, t) => s + Number(t.total), 0);
  const nTotal = tramos.reduce((s, t) => s + Number(t.n), 0);

  // "Hoy" se deriva del propio RPC (el borde de 0–30 es hoy−30) en vez de leerlo
  // del reloj de Node: así la columna de espera y los tramos no se pueden
  // desfasar un día por la zona horaria del servidor.
  const borde030 = porTramo.get("0_30")?.desde ?? null;
  const hoy = borde030 ? masDias(borde030, 30) : new Date().toISOString().slice(0, 10);

  // El listado se acota con los MISMOS límites que devolvió el RPC.
  const sel = tramoSel ? porTramo.get(tramoSel) : null;
  const inner = servicioId ? ", siigo_factura_lineas!inner(servicio_id)" : "";
  let query = supabase
    .from("siigo_facturas")
    .select(`id, numero, fecha, cliente_id, cliente_identificacion, cliente_nombre_siigo, total, saldo${inner}`, { count: "exact" })
    .gt("saldo", 0);
  if (servicioId) query = query.eq("siigo_factura_lineas.servicio_id", servicioId);
  if (sel?.desde) query = query.gte("fecha", sel.desde);
  if (sel?.hasta) query = query.lte("fecha", sel.hasta);

  const [{ data: facturasRaw, count }, { data: servicios }] = await Promise.all([
    query.order("fecha", { ascending: false }).order("id", { ascending: false }).range(from, to),
    supabase.from("servicios").select("id, nombre").order("orden"),
  ]);
  const facturas = (facturasRaw ?? []) as unknown as FacturaRow[];

  const facIds = facturas.map((f) => f.id);
  const cliIds = [...new Set(facturas.map((f) => f.cliente_id).filter((x): x is number => x != null))];
  const [{ data: lineas }, { data: clientes }] = await Promise.all([
    facIds.length
      ? supabase.from("siigo_factura_lineas").select("factura_id, servicio_id").in("factura_id", facIds)
      : Promise.resolve({ data: [] as { factura_id: number; servicio_id: number | null }[] }),
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
  const desdeN = total === 0 ? 0 : from + 1;
  const hastaN = Math.min(from + PAGE_SIZE, total);
  const href = (o: { page?: number; tramo?: string | null }) => {
    const p = new URLSearchParams();
    if (servicioId) p.set("servicio", String(servicioId));
    const tr = o.tramo === undefined ? tramoSel : o.tramo;
    if (tr) p.set("tramo", tr);
    if ((o.page ?? 1) > 1) p.set("page", String(o.page));
    const qs = p.toString();
    return qs ? `/cartera?${qs}` : "/cartera";
  };
  const filtroNombre = servicioId ? svName.get(servicioId) ?? "Servicio" : null;
  const tramoNombre = tramoSel ? TRAMOS.find((t) => t.key === tramoSel)!.label.toLowerCase() : null;

  return (
    <div className="space-y-6">
      <div>
        {can(profile.role, "dashboard") && (
          <Link href="/dashboard" className="text-muted-foreground text-sm hover:underline">
            ← Dashboard
          </Link>
        )}
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="cdaf-headline">Cartera por cobrar</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Facturas de Siigo con saldo pendiente
              {filtroNombre ? <> de <strong className="text-foreground">{filtroNombre}</strong></> : null}
              {tramoNombre ? <> con <strong className="text-foreground">{tramoNombre}</strong> de espera</> : null}
              {" · "}
              <strong className="text-foreground">{COP.format(carteraTotal)}</strong> en {nTotal} factura(s) en total.
              Las que no tienen cliente se asignan en la <Link href="/pagos" className="underline">Bolsa de pagos</Link>.
            </p>
          </div>
          <FiltroServicio
            servicios={servicios ?? []}
            value={servicioId ? String(servicioId) : ""}
            basePath="/cartera"
          />
        </div>
      </div>

      {/* Antigüedad: a quién hay que llamar primero */}
      <div className="grid gap-4 sm:grid-cols-3">
        {TRAMOS.map(({ key, label, icon: Icon, tono }) => {
          const t = porTramo.get(key);
          const activo = tramoSel === key;
          return (
            <Link
              key={key}
              href={href({ tramo: activo ? null : key, page: 1 })}
              aria-current={activo ? "true" : undefined}
              className={cn(
                "bg-card rounded-xl p-4 shadow-sm ring-1 transition-all hover:shadow-md",
                activo ? "ring-primary ring-2" : "ring-foreground/[0.06]",
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-lg ring-1",
                    tono === "ok" && "bg-muted text-muted-foreground ring-foreground/[0.06]",
                    tono === "aviso" && "bg-warning/15 text-warning-foreground ring-warning/25",
                    tono === "alerta" && "bg-destructive/10 text-destructive ring-destructive/20",
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <span className="cdaf-eyebrow text-muted-foreground">{label}</span>
              </div>
              <p className="font-heading mt-3 text-2xl font-semibold tracking-tight tabular-nums">
                {COP.format(Number(t?.total ?? 0))}
              </p>
              <p className="text-muted-foreground text-xs">
                {Number(t?.n ?? 0)} factura(s){activo ? " · toca para quitar el filtro" : ""}
              </p>
            </Link>
          );
        })}
      </div>

      {total === 0 ? (
        <EmptyState
          icon={CircleCheck}
          title={servicioId || tramoSel ? "Sin cartera pendiente con ese filtro" : "Sin cartera pendiente"}
          description={
            servicioId || tramoSel
              ? "Prueba con otro tramo o servicio, o quita el filtro."
              : "Ninguna factura tiene saldo por cobrar. ¡Todo al día!"
          }
        />
      ) : (
        <>
          <div className="cdaf-table-wrap">
            <table className="cdaf-table">
              <thead>
                <tr>
                  <th className="px-4 py-2">Fecha</th>
                  <th className="px-4 py-2 text-right">Espera</th>
                  <th className="px-4 py-2">Factura</th>
                  <th className="px-4 py-2">Cliente</th>
                  <th className="px-4 py-2">Detalle</th>
                  <th className="px-4 py-2 text-right">Total</th>
                  <th className="px-4 py-2 text-right">Debe</th>
                </tr>
              </thead>
              <tbody>
                {facturas.map((f) => {
                  const svs = svsByFac.get(f.id) ?? [];
                  const dias = diasEntre(f.fecha, hoy);
                  return (
                    <tr key={f.id} className="border-t">
                      <td className="px-4 py-2 whitespace-nowrap tabular-nums">{f.fecha}</td>
                      <td
                        className={cn(
                          "px-4 py-2 text-right whitespace-nowrap tabular-nums",
                          dias > 60 ? "text-destructive font-medium" : dias > 30 ? "font-medium" : "text-muted-foreground",
                        )}
                      >
                        {dias} d
                      </td>
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
              {desdeN}–{hastaN} de {total} · Página {page} de {totalPages}
            </span>
            <div className="flex items-center gap-2">
              {page > 1 ? (
                <Link href={href({ page: page - 1 })} className={buttonVariants({ variant: "outline", size: "sm" })}>← Anterior</Link>
              ) : (
                <span className={`${buttonVariants({ variant: "outline", size: "sm" })} pointer-events-none opacity-40`}>← Anterior</span>
              )}
              {page < totalPages ? (
                <Link href={href({ page: page + 1 })} className={buttonVariants({ variant: "outline", size: "sm" })}>Siguiente →</Link>
              ) : (
                <span className={`${buttonVariants({ variant: "outline", size: "sm" })} pointer-events-none opacity-40`}>Siguiente →</span>
              )}
            </div>
          </div>

          <p className="text-muted-foreground text-xs">
            La espera se cuenta desde la fecha de la factura: Siigo no expone fecha de vencimiento ni plazo de pago.
          </p>
        </>
      )}
    </div>
  );
}
