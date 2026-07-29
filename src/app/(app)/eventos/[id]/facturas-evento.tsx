"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import Link from "next/link";
import { Link2 } from "lucide-react";
import { atarFacturas } from "../actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { FacturaLink, type FacturaDetalleData } from "@/components/factura-detalle";
import { cn } from "@/lib/utils";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

/**
 * Cómo llegó la factura, en el lenguaje de /pagos. Se muestra para que se vea de dónde
 * sale cada candidata: las de "Mostrador" y "Cliente identificado" NUNCA aparecen en la
 * cola de conciliación, y son justamente las que antes se perdían.
 */
const ESTADO: Record<string, string> = {
  mostrador: "Mostrador",
  auto: "Cliente identificado",
  pendiente: "Por conciliar",
  conciliada: "Conciliada",
};

export type Candidata = {
  id: number;
  numero: string | null;
  fecha: string;
  cliente_nombre_siigo: string | null;
  cliente_identificacion: string | null;
  total: number;
  estado_conciliacion: string;
  detalle: string | null;
  /** Parte de la factura que es del servicio del evento (la inscripción). */
  monto_evento: number;
  /** Para abrir el detalle con sus líneas, igual que en la ficha del cliente. */
  detalleFactura: FacturaDetalleData | null;
};

/**
 * Selector de facturas candidatas del evento. El padre lo monta con `key` = los ids de
 * las candidatas, así la selección se limpia sola cuando la lista cambia tras atar.
 *
 * La factura se ata COMPLETA: el evento se mide por contribución (si no hubiera torneo
 * esa persona no habría estado en el club consumiendo). La columna "Inscripción" es solo
 * para ver qué parte es cobro del evento y qué parte es consumo.
 */
export function FacturasCandidatas({
  eventoId,
  candidatas,
  ventana,
  todas,
}: {
  eventoId: number;
  candidatas: Candidata[];
  /** "23 jul → 23 ago", ya formateado en el servidor. */
  ventana: string;
  /** true = se están mostrando TODAS las facturas de la ventana, no solo las del servicio. */
  todas: boolean;
}) {
  const [state, action, pending] = useActionState(atarFacturas, {});
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [q, setQ] = useState("");

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return candidatas;
    return candidatas.filter((c) =>
      [c.numero, c.cliente_nombre_siigo, c.cliente_identificacion, c.detalle]
        .some((v) => (v ?? "").toLowerCase().includes(t)),
    );
  }, [candidatas, q]);

  const alternar = (id: number) =>
    setSel((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });

  const todasVisiblesMarcadas = visibles.length > 0 && visibles.every((c) => sel.has(c.id));
  const marcarTodas = () =>
    setSel((prev) => {
      const s = new Set(prev);
      if (todasVisiblesMarcadas) visibles.forEach((c) => s.delete(c.id));
      else visibles.forEach((c) => s.add(c.id));
      return s;
    });

  const montoSel = candidatas.filter((c) => sel.has(c.id)).reduce((s, c) => s + c.total, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">
          {todas
            ? `Todo lo facturado entre ${ventana}, tenga o no cobro del evento. Marca lo que se vendió gracias al evento.`
            : `Facturas con cobro del evento entre ${ventana} que aún no están atadas. Se atan completas, con el consumo incluido.`}
        </p>
        {candidatas.length > 6 && (
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por número o nombre…"
            className="h-8 w-56 text-xs"
          />
        )}
      </div>

      <div className="cdaf-table-wrap">
        <table className="cdaf-table">
          <thead>
            <tr>
              <th className="w-9 px-3 py-2">
                <input
                  type="checkbox"
                  checked={todasVisiblesMarcadas}
                  onChange={marcarTodas}
                  className="accent-primary size-3.5 align-middle"
                  aria-label="Marcar todas"
                />
              </th>
              <th className="px-4 py-2">Factura</th>
              <th className="px-4 py-2">Cliente</th>
              <th className="px-4 py-2">Concepto</th>
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2 text-right" title="Parte de la factura que es cobro del evento">
                Inscripción
              </th>
              <th className="px-4 py-2 text-right">Total factura</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((c) => (
              <tr
                key={c.id}
                className={cn("border-t cursor-pointer", sel.has(c.id) && "bg-primary/[0.06]")}
                onClick={() => alternar(c.id)}
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={sel.has(c.id)}
                    onChange={() => alternar(c.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="accent-primary size-3.5 align-middle"
                    aria-label={`Atar factura ${c.numero ?? c.id}`}
                  />
                </td>
                <td className="px-4 py-2">
                  {/* El clic en el número abre el detalle; no debe marcar/desmarcar la fila. */}
                  <span className="tabular-nums" onClick={(e) => e.stopPropagation()}>
                    {c.detalleFactura ? (
                      <FacturaLink factura={c.detalleFactura} />
                    ) : (
                      (c.numero ?? `#${c.id}`)
                    )}
                  </span>
                  <Badge variant="outline" className="ml-2 text-[10px]">
                    {ESTADO[c.estado_conciliacion] ?? c.estado_conciliacion}
                  </Badge>
                </td>
                <td className="px-4 py-2">
                  {c.cliente_nombre_siigo ?? <span className="text-muted-foreground">Sin identificar</span>}
                </td>
                <td className="text-muted-foreground max-w-[22rem] truncate px-4 py-2 text-xs">
                  {c.detalle ?? "—"}
                </td>
                <td className="text-muted-foreground px-4 py-2 tabular-nums">{c.fecha}</td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {c.monto_evento > 0 ? (
                    COP.format(c.monto_evento)
                  ) : (
                    <span className="text-muted-foreground" title="Esta factura no tiene cobro del evento">—</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{COP.format(c.total)}</td>
              </tr>
            ))}
            {visibles.length === 0 && (
              <tr className="border-t">
                <td colSpan={7} className="text-muted-foreground px-4 py-3 text-sm">
                  Ninguna candidata coincide con “{q}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <form action={action} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="evento_id" value={eventoId} />
        {[...sel].map((id) => (
          <input key={id} type="hidden" name="factura_id" value={id} />
        ))}
        <Button type="submit" size="sm" className="gap-1.5" disabled={sel.size === 0 || pending}>
          <Link2 className="size-3.5" />
          {pending
            ? "Atando…"
            : sel.size === 0
              ? "Atar al evento"
              : `Atar ${sel.size} ${sel.size === 1 ? "factura" : "facturas"} · ${COP.format(montoSel)}`}
        </Button>
        {state.error && <p className="text-destructive text-xs">{state.error}</p>}
        {state.ok && <p className="text-muted-foreground text-xs">{state.ok}</p>}
      </form>

      {/* El evento se mide por contribución: quien vino al torneo y solo consumió también
          cuenta, aunque su factura no tenga ninguna línea del servicio del evento. */}
      <p className="text-muted-foreground border-t pt-3 text-xs">
        {todas ? (
          <>
            Estás viendo todo lo facturado en las fechas del evento, así que hay mucho que no es suyo.{" "}
            <Link href={`/eventos/${eventoId}`} className="underline">
              Volver a las que tienen cobro del evento
            </Link>
            .
          </>
        ) : (
          <>
            ¿Falta alguien que vino al evento y solo consumió en cafetería?{" "}
            <Link href={`/eventos/${eventoId}?todas=1`} className="underline">
              Ver todas las facturas de estas fechas
            </Link>
            .
          </>
        )}
      </p>
    </div>
  );
}
