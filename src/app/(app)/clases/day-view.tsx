"use client";

import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EventoDetalle } from "./evento-detalle";
import { eventoBg, eventoDot, type CalEvento } from "./types";

export function DayView({ eventos }: { eventos: CalEvento[] }) {
  const [sel, setSel] = useState<CalEvento | null>(null);

  const conHora = eventos.filter((e) => e.hora).sort((a, b) => a.hora.localeCompare(b.hora));
  const sinHora = eventos.filter((e) => !e.hora);

  const horasNum = conHora.map((e) => parseInt(e.hora.slice(0, 2), 10)).filter((n) => !Number.isNaN(n));
  const minH = horasNum.length ? Math.min(...horasNum) : 7;
  const maxH = horasNum.length ? Math.max(...horasNum) : 20;
  const franjas = Array.from({ length: maxH - minH + 1 }, (_, i) => minH + i);

  const byHora = new Map<number, CalEvento[]>();
  for (const e of conHora) {
    const h = parseInt(e.hora.slice(0, 2), 10);
    if (Number.isNaN(h)) continue;
    if (!byHora.has(h)) byHora.set(h, []);
    byHora.get(h)!.push(e);
  }

  function Chip({ e }: { e: CalEvento }) {
    return (
      <button
        type="button"
        onClick={() => setSel(e)}
        className={`hover:ring-lime flex items-center gap-2 rounded-md border px-2 py-1 text-left hover:ring-2 ${eventoBg(e)}${e.cancelada ? " line-through opacity-50" : ""}`}
      >
        <span className={`size-2 shrink-0 rounded-full ${eventoDot(e)}`} />
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">{e.hora}</span>
        <span className="max-w-[16rem] truncate text-sm font-medium">{e.titulo}</span>
        <span className="text-muted-foreground shrink-0 text-xs">{e.estadoLabel}</span>
      </button>
    );
  }

  return (
    <>
      {sinHora.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <span className="text-muted-foreground self-center text-xs">Sin hora:</span>
          {sinHora.map((e) => <Chip key={e.id} e={e} />)}
        </div>
      )}

      {conHora.length === 0 && sinHora.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
          No hay clases ni reservas este día.
        </p>
      ) : (
        <div className="divide-border overflow-hidden rounded-lg border">
          {franjas.map((h) => {
            const items = byHora.get(h) ?? [];
            return (
              <div key={h} className="flex items-stretch gap-3 border-b last:border-b-0">
                <div className="text-muted-foreground bg-muted/40 w-16 shrink-0 px-2 py-2 text-sm tabular-nums">
                  {String(h).padStart(2, "0")}:00
                </div>
                <div className="flex flex-1 flex-wrap items-start gap-1.5 py-2 pr-2">
                  {items.length > 0
                    ? items.map((e) => <Chip key={e.id} e={e} />)
                    : <span className="text-muted-foreground/30 self-center text-xs">—</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!sel} onOpenChange={(o) => !o && setSel(null)}>
        <DialogContent>{sel && <EventoDetalle ev={sel} />}</DialogContent>
      </Dialog>
    </>
  );
}
