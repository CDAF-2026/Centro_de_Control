"use client";

import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EventoDetalle } from "./evento-detalle";
import { eventoBg, type CalEvento } from "./types";

const HOUR_W = 84; // px por hora
const LABEL_W = 170; // px etiqueta de profesor
const BAR_H = 26;
const GAP = 3;

function toMin(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function ProfesorView({ eventos, esHoy }: { eventos: CalEvento[]; esHoy: boolean }) {
  const [sel, setSel] = useState<CalEvento | null>(null);

  // Solo eventos atribuidos a un profesor (clases); con hora para ubicarlos
  const conProf = eventos.filter((e) => e.profesor && e.hora);

  if (conProf.length === 0) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
        No hay clases con profesor asignado este día.
      </p>
    );
  }

  // Rango horario
  const starts = conProf.map((e) => toMin(e.hora));
  const ends = conProf.map((e) => (e.horaFin ? toMin(e.horaFin) : toMin(e.hora) + 60));
  const startHour = Math.max(0, Math.floor(Math.min(...starts) / 60));
  const endHour = Math.min(24, Math.ceil(Math.max(...ends) / 60));
  const hours = Array.from({ length: Math.max(1, endHour - startHour) }, (_, i) => startHour + i);
  const trackW = hours.length * HOUR_W;
  const origin = startHour * 60;

  // Agrupar por profesor
  const profes = new Map<string, CalEvento[]>();
  for (const e of conProf) {
    const p = e.profesor!;
    if (!profes.has(p)) profes.set(p, []);
    profes.get(p)!.push(e);
  }
  const filas = [...profes.entries()].sort((a, b) => a[0].localeCompare(b[0], "es", { numeric: true }));

  function pack(evs: CalEvento[]) {
    const sorted = [...evs].sort((a, b) => toMin(a.hora) - toMin(b.hora));
    const laneEnds: number[] = [];
    const placed = sorted.map((e) => {
      const s = toMin(e.hora);
      const en = Math.max(e.horaFin ? toMin(e.horaFin) : s + 60, s + 20);
      let lane = laneEnds.findIndex((end) => end <= s);
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(en); } else { laneEnds[lane] = en; }
      return { e, s, en, lane };
    });
    return { placed, lanes: Math.max(1, laneEnds.length) };
  }

  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const showNow = esHoy && nowMin >= origin && nowMin <= endHour * 60;
  const nowLeft = ((nowMin - origin) / 60) * HOUR_W;

  return (
    <>
      <div className="overflow-x-auto rounded-lg border">
        <div style={{ width: LABEL_W + trackW }}>
          {/* Cabecera de horas */}
          <div className="bg-muted flex border-b">
            <div className="bg-muted sticky left-0 z-20 shrink-0 border-r" style={{ width: LABEL_W }} />
            {hours.map((h) => (
              <div
                key={h}
                className="text-muted-foreground shrink-0 border-l py-1 pl-1 text-xs tabular-nums"
                style={{ width: HOUR_W }}
              >
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>

          {/* Una fila por profesor */}
          {filas.map(([profesor, evs]) => {
            const { placed, lanes } = pack(evs);
            const rowH = lanes * (BAR_H + GAP) + GAP;
            return (
              <div key={profesor} className="flex border-b last:border-b-0">
                <div
                  className="bg-card text-foreground sticky left-0 z-10 flex shrink-0 items-center border-r px-2 text-xs font-medium"
                  style={{ width: LABEL_W }}
                >
                  <span className="truncate" title={profesor}>{profesor}</span>
                </div>
                <div className="relative" style={{ width: trackW, height: rowH }}>
                  {hours.map((h, i) => (
                    <div key={h} className="border-border/60 absolute top-0 bottom-0 border-l" style={{ left: i * HOUR_W }} />
                  ))}
                  {showNow && <div className="bg-destructive absolute top-0 bottom-0 z-10 w-px" style={{ left: nowLeft }} />}
                  {placed.map(({ e, s, en, lane }) => {
                    const left = ((s - origin) / 60) * HOUR_W;
                    const width = Math.max(((en - s) / 60) * HOUR_W - 2, 28);
                    const top = GAP + lane * (BAR_H + GAP);
                    return (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => setSel(e)}
                        title={`${e.hora}${e.horaFin ? `–${e.horaFin}` : ""} · ${e.titulo}`}
                        className={`hover:ring-lime absolute overflow-hidden rounded px-1 text-left text-xs hover:z-20 hover:ring-2 ${eventoBg(e)}${e.cancelada ? " line-through opacity-50" : ""}${e.fuente === "easycancha" ? " border-foreground/30 border-l-2" : ""}`}
                        style={{ left, width, top, height: BAR_H }}
                      >
                        <span className="block truncate leading-snug">{e.hora} {e.titulo}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Dialog open={!!sel} onOpenChange={(o) => !o && setSel(null)}>
        <DialogContent>{sel && <EventoDetalle ev={sel} />}</DialogContent>
      </Dialog>
    </>
  );
}
