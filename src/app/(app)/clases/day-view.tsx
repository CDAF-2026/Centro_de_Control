"use client";

import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EventoDetalle } from "./evento-detalle";
import { eventoBg, type CalEvento } from "./types";

function chipClass(e: CalEvento) {
  const cancel = e.cancelada ? " line-through opacity-50" : "";
  const ec = e.fuente === "easycancha" ? " border-foreground/30 border-l-2" : "";
  return `${eventoBg(e)}${cancel}${ec}`;
}

export function DayView({ eventos, esHoy }: { eventos: CalEvento[]; esHoy: boolean }) {
  const [sel, setSel] = useState<CalEvento | null>(null);

  const conHora = eventos.filter((e) => e.hora);
  const sinHora = eventos.filter((e) => !e.hora);

  if (conHora.length === 0 && sinHora.length === 0) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
        No hay clases ni reservas este día.
      </p>
    );
  }

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
  for (const arr of byHora.values()) arr.sort((a, b) => a.hora.localeCompare(b.hora));

  const nowH = new Date().getHours();

  function Chip({ e }: { e: CalEvento }) {
    return (
      <button
        type="button"
        onClick={() => setSel(e)}
        title={`${e.hora}${e.horaFin ? `–${e.horaFin}` : ""} · ${e.titulo}`}
        className={`hover:ring-lime max-w-full truncate rounded px-1.5 py-0.5 text-left text-xs hover:ring-2 ${chipClass(e)}`}
      >
        {e.hora} {e.titulo}
      </button>
    );
  }

  return (
    <>
      {sinHora.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground text-xs">Sin hora:</span>
          {sinHora.map((e) => <Chip key={e.id} e={e} />)}
        </div>
      )}

      <div className="bg-border grid grid-cols-[4rem_1fr] gap-px overflow-hidden rounded-lg border">
        {franjas.map((h) => {
          const items = byHora.get(h) ?? [];
          const actual = esHoy && h === nowH;
          return (
            <div key={h} className="contents">
              <div className="bg-muted text-muted-foreground px-2 py-2 text-right text-xs tabular-nums">
                {String(h).padStart(2, "0")}:00
              </div>
              <div className={`flex min-h-12 flex-wrap content-start gap-1 p-1.5 ${actual ? "bg-lime/10" : "bg-card"}`}>
                {items.map((e) => <Chip key={e.id} e={e} />)}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={!!sel} onOpenChange={(o) => !o && setSel(null)}>
        <DialogContent>{sel && <EventoDetalle ev={sel} />}</DialogContent>
      </Dialog>
    </>
  );
}
