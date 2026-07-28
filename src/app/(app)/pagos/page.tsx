import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConciliarForm, DevolverACola } from "./conciliar-form";
import { EmptyState } from "@/components/ui/empty-state";
import { Wallet, Search } from "lucide-react";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

/** Etiqueta legible del estado de conciliación. */
const ESTADO: Record<string, { texto: string; clase: string }> = {
  pendiente: { texto: "Por conciliar", clase: "border-primary/40" },
  mostrador: { texto: "Mostrador", clase: "text-muted-foreground" },
  auto: { texto: "Cliente identificado", clase: "" },
  conciliada: { texto: "Conciliada", clase: "" },
};

export default async function PagosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireRole(rolesForModule("bolsa_pagos"));
  const supabase = await createClient();
  // Buscador: encuentra CUALQUIER factura (también las de mostrador, que no salen en la cola).
  // Se limpian comas y paréntesis porque romperían el filtro `or` de PostgREST.
  const q = ((await searchParams).q ?? "").replace(/[,()*]/g, " ").trim();

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
      // Solo eventos ABIERTOS: atarle una factura a uno ya cerrado dejaría su snapshot
      // (el que está publicado en el dashboard) desfasado del detalle. Para eso se reabre.
      supabase
        .from("eventos")
        .select("id, nombre, servicio_id, fecha_inicio, fecha_fin")
        .is("cerrado_el", null)
        .neq("estado", "cancelado")
        .order("fecha_inicio", { ascending: false }),
      supabase.from("siigo_sync").select("updated_at").eq("id", 1).maybeSingle(),
      supabase.from("siigo_facturas").select("*", { count: "exact", head: true }).eq("estado_conciliacion", "mostrador"),
      supabase.from("siigo_facturas").select("*", { count: "exact", head: true }).eq("estado_conciliacion", "conciliada"),
    ]);

  const { data: encontradas } = q
    ? await supabase
        .from("siigo_facturas")
        .select("id, numero, fecha, cliente_identificacion, cliente_nombre_siigo, total, saldo, estado_conciliacion")
        .or(`numero.ilike.%${q}%,cliente_nombre_siigo.ilike.%${q}%,cliente_identificacion.ilike.%${q}%`)
        .order("fecha", { ascending: false })
        .limit(20)
    : { data: null };

  const svName = new Map((servicios ?? []).map((s) => [s.id, s.nombre]));
  const lineasByFac = new Map<number, { descripcion: string | null; servicio_id: number | null; monto: number }[]>();
  for (const l of lineas ?? []) {
    const a = lineasByFac.get(l.factura_id) ?? [];
    a.push(l);
    lineasByFac.set(l.factura_id, a);
  }

  /**
   * Sugerencia de evento: si la factura tiene una línea del servicio de un evento abierto
   * (p. ej. "Torneos") y su fecha cae cerca del evento, se preselecciona. Sin esto nadie
   * ata las facturas a mano y el P&G de todos los torneos daría pérdida.
   *
   * La ventana va 15 días antes y después: las inscripciones se facturan desde antes del
   * torneo y las cuentas de última hora, días después.
   */
  const TOLERANCIA_DIAS = 15;
  const corre = (iso: string, dias: number) => {
    const d = new Date(`${iso}T00:00:00`);
    d.setDate(d.getDate() + dias);
    return d.toISOString().slice(0, 10);
  };
  const ventanas = (eventos ?? []).map((e) => ({
    id: e.id,
    nombre: e.nombre,
    servicioId: e.servicio_id,
    desde: corre(e.fecha_inicio, -TOLERANCIA_DIAS),
    hasta: corre(e.fecha_fin ?? e.fecha_inicio, TOLERANCIA_DIAS),
  }));
  const eventoSugerido = (facturaId: number, fecha: string): { id: number; nombre: string } | null => {
    const servicioIds = new Set(
      (lineasByFac.get(facturaId) ?? []).map((l) => l.servicio_id).filter((x): x is number => x != null),
    );
    if (servicioIds.size === 0) return null;
    const m = ventanas.find(
      (v) => v.servicioId != null && servicioIds.has(v.servicioId) && fecha >= v.desde && fecha <= v.hasta,
    );
    return m ? { id: m.id, nombre: m.nombre } : null;
  };

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
        aplica—. Las ventas de mostrador anónimas ya entraron como ingreso y no aparecen aquí. La sincronización con Siigo
        corre sola cada 20 minutos (y cada noche se refrescan los saldos).
      </p>

      {/* Buscador: rescata facturas que no están en la cola (mostrador, ya conciliadas…). */}
      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="cdaf-title">Buscar una factura</h2>
        <p className="text-muted-foreground text-sm">
          Busca por número de factura, nombre o NIT — incluye las de mostrador, que no salen en la cola. Si una venta
          quedó cerrada por error, devuélvela a la cola para conciliarla.
        </p>
        <form method="GET" className="flex flex-wrap items-center gap-2">
          <Input name="q" defaultValue={q} placeholder="Ej: 5618, FV-2-5618, un nombre o un NIT…" className="max-w-xs" />
          <Button type="submit" size="sm" variant="outline">
            <Search className="size-4" /> Buscar
          </Button>
        </form>

        {q && (
          <div className="space-y-2">
            {(encontradas ?? []).map((f) => {
              const est = ESTADO[f.estado_conciliacion ?? ""] ?? { texto: f.estado_conciliacion ?? "—", clase: "" };
              return (
                <div key={f.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold tabular-nums">{COP.format(f.total)}</span>
                    <Badge variant="outline" className={est.clase}>{est.texto}</Badge>
                    {f.saldo > 0 && (
                      <Badge variant="outline" className="text-destructive border-destructive/40">Debe {COP.format(f.saldo)}</Badge>
                    )}
                    <span className="text-muted-foreground text-sm">
                      {f.cliente_nombre_siigo ? <strong className="text-foreground">{f.cliente_nombre_siigo}</strong> : null}
                      {f.cliente_nombre_siigo ? " · " : ""}
                      {f.numero ?? "—"} · {f.fecha} · NIT {f.cliente_identificacion ?? "—"}
                    </span>
                  </div>
                  <div className="mt-2">
                    {f.estado_conciliacion === "pendiente" ? (
                      <ConciliarForm
                        facturaId={f.id}
                        eventos={eventos ?? []}
                        sugerido={eventoSugerido(f.id, f.fecha)}
                      />
                    ) : (
                      <DevolverACola facturaId={f.id} />
                    )}
                  </div>
                </div>
              );
            })}
            {(encontradas ?? []).length === 0 && (
              <p className="text-muted-foreground py-4 text-center text-sm">
                Ninguna factura coincide con «{q}».
              </p>
            )}
          </div>
        )}
      </section>

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
                <ConciliarForm facturaId={f.id} eventos={eventos ?? []} sugerido={eventoSugerido(f.id, f.fecha)} />
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
