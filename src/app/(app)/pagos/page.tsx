import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { ConciliarForm } from "./conciliar-form";
import { EmptyState } from "@/components/ui/empty-state";
import { Wallet } from "lucide-react";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

export default async function PagosPage() {
  await requireRole(rolesForModule("bolsa_pagos"));
  const supabase = await createClient();

  const { data: pendientes } = await supabase
    .from("siigo_facturas")
    .select("id, numero, fecha, cliente_identificacion, cliente_nombre_siigo, total, saldo")
    .eq("estado_conciliacion", "pendiente")
    .order("saldo", { ascending: false })
    .order("fecha", { ascending: false });

  const ids = (pendientes ?? []).map((f) => f.id);
  const [{ data: lineas }, { data: servicios }, { data: eventos }, { data: sync }, mostradorRes, conciliadasRes] =
    await Promise.all([
      ids.length
        ? supabase.from("siigo_factura_lineas").select("factura_id, descripcion, servicio_id, monto").in("factura_id", ids)
        : Promise.resolve({ data: [] as { factura_id: number; descripcion: string | null; servicio_id: number | null; monto: number }[] }),
      supabase.from("servicios").select("id, nombre"),
      supabase.from("eventos").select("id, nombre").order("fecha_inicio", { ascending: false }),
      supabase.from("siigo_sync").select("updated_at").eq("id", 1).maybeSingle(),
      supabase.from("siigo_facturas").select("*", { count: "exact", head: true }).eq("estado_conciliacion", "mostrador"),
      supabase.from("siigo_facturas").select("*", { count: "exact", head: true }).eq("estado_conciliacion", "conciliada"),
    ]);

  const svName = new Map((servicios ?? []).map((s) => [s.id, s.nombre]));
  const lineasByFac = new Map<number, { descripcion: string | null; servicio_id: number | null; monto: number }[]>();
  for (const l of lineas ?? []) {
    const a = lineasByFac.get(l.factura_id) ?? [];
    a.push(l);
    lineasByFac.set(l.factura_id, a);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="cdaf-headline">Bolsa de pagos · conciliación</h1>
        {sync?.updated_at && (
          <span className="text-muted-foreground text-xs">
            Última sync Siigo: {new Date(sync.updated_at).toLocaleString("es-CO")}
          </span>
        )}
      </div>
      <p className="text-muted-foreground text-sm">
        Facturas de Siigo que necesitan dueño (tienen deuda o cliente identificado). Asígnales el cliente —y el evento si
        aplica—. Las ventas de mostrador anónimas ya entraron como ingreso y no aparecen aquí. Para traer lo nuevo de Siigo,
        corre <code className="bg-muted rounded px-1">npm run sync:siigo</code>.
      </p>

      <section className="space-y-3">
        <h2 className="cdaf-title">Por conciliar ({pendientes?.length ?? 0})</h2>
        <div className="space-y-2">
          {(pendientes ?? []).map((f) => (
            <div key={f.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{COP.format(f.total)}</span>
                {f.saldo > 0 && (
                  <Badge variant="outline" className="text-destructive border-destructive/40">Debe {COP.format(f.saldo)}</Badge>
                )}
                <span className="text-muted-foreground text-sm">
                  {f.cliente_nombre_siigo ? <strong className="text-foreground">{f.cliente_nombre_siigo}</strong> : null}
                  {f.cliente_nombre_siigo ? " · " : ""}
                  {f.numero ?? "—"} · {f.fecha} · NIT {f.cliente_identificacion ?? "—"}
                </span>
              </div>
              <p className="text-muted-foreground mt-1 text-xs">
                {(lineasByFac.get(f.id) ?? [])
                  .map((l) => `${svName.get(l.servicio_id ?? -1) ?? "Sin categoría"}: ${l.descripcion ?? ""}`)
                  .join(" · ")
                  .slice(0, 220)}
              </p>
              <div className="mt-2">
                <ConciliarForm facturaId={f.id} eventos={eventos ?? []} />
              </div>
            </div>
          ))}
          {(pendientes ?? []).length === 0 && (
            <EmptyState icon={Wallet} title="Nada por conciliar" description="Todas las facturas con dueño están conciliadas." />
          )}
        </div>
      </section>

      <p className="text-muted-foreground border-t pt-4 text-xs">
        {conciliadasRes.count ?? 0} factura(s) conciliada(s) · {mostradorRes.count ?? 0} de mostrador (ingreso cerrado).
      </p>
    </div>
  );
}
