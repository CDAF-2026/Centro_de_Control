"use client";

import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EventoDetalle } from "./evento-detalle";
import { eventoBg, type CalEvento } from "./types";

const HOUR_W = 84; // px por hora
const LABEL_W = 150; // px etiqueta de cancha
const BAR_H = 26;
const GAP = 3;

function toMin(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
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

  // Rango horario del día (con margen a hora completa)
  const starts = conHora.map((e) => toMin(e.hora));
  const ends = conHora.map((e) => (e.horaFin ? toMin(e.horaFin) : toMin(e.hora) + 60));
  const startHour = conHora.length ? Math.max(0, Math.floor(Math.min(...starts) / 60)) : 7;
  const endHour = conHora.length ? Math.min(24, Math.ceil(Math.max(...ends) / 60)) : 21;
  const hours = Array.from({ length: Math.max(1, endHour - startHour) }, (_, i) => startHour + i);
  const trackW = hours.length * HOUR_W;
  const origin = startHour * 60;

  // Agrupar por cancha
  const canchas = new Map<string, CalEvento[]>();
  for (const e of conHora) {
    const c = e.cancha?.trim() || "Sin cancha";
    if (!canchas.has(c)) canchas.set(c, []);
    canchas.get(c)!.push(e);
  }
  const filas = [...canchas.entries()].sort((a, b) => {
    if (a[0] === "Sin cancha") return 1;
    if (b[0] === "Sin cancha") return -1;
    return a[0].localeCompare(b[0], "es", { numeric: true });
  });

  // Empaquetado en carriles para evitar solapes dentro de una cancha
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

          {/* Una fila por cancha */}
          {filas.map(([cancha, evs]) => {
            const { placed, lanes } = pack(evs);
            const rowH = lanes * (BAR_H + GAP) + GAP;
            return (
              <div key={cancha} className="flex border-b last:border-b-0">
                <div
                  className="bg-card sticky left-0 z-10 flex shrink-0 items-center border-r px-2 text-xs font-medium"
                  style={{ width: LABEL_W }}
                >
                  <span className="truncate" title={cancha}>{cancha}</span>
                </div>
                <div className="relative" style={{ width: trackW, height: rowH }}>
                  {/* Líneas de hora */}
                  {hours.map((h, i) => (
                    <div key={h} className="border-border/60 absolute top-0 bottom-0 border-l" style={{ left: i * HOUR_W }} />
                  ))}
                  {/* Línea de "ahora" */}
                  {showNow && <div className="bg-destructive absolute top-0 bottom-0 z-10 w-px" style={{ left: nowLeft }} />}
                  {/* Barras de eventos */}
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

      {sinHora.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground text-xs">Sin hora:</span>
          {sinHora.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => setSel(e)}
              className={`rounded-md border px-2 py-1 text-xs ${eventoBg(e)}${e.cancelada ? " line-through opacity-50" : ""}`}
            >
              {e.titulo}
            </button>
          ))}
        </div>
      )}

      <Dialog open={!!sel} onOpenChange={(o) => !o && setSel(null)}>
        <DialogContent>{sel && <EventoDetalle ev={sel} />}</DialogContent>
      </Dialog>
    </>
  );
}
