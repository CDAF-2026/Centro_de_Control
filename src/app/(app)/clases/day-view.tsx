"use client";

import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EventoDetalle } from "./evento-detalle";
import { eventoBg, type CalEvento } from "./types";

const HORA_INICIO = 7; // horario base del club
const HORA_FIN = 21;
const HOUR_H = 52; // px por hora

function toMin(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

type Bloque = { ev: CalEvento; s: number; en: number; lane: number; lanes: number };

/** Empaqueta los eventos en carriles por cluster de solape (estilo Google Calendar). */
function empaquetar(eventos: CalEvento[]): Bloque[] {
  const items = eventos
    .map((ev) => {
      const s = toMin(ev.hora);
      const en = Math.max(ev.horaFin ? toMin(ev.horaFin) : s + 60, s + 20);
      return { ev, s, en };
    })
    .sort((a, b) => a.s - b.s || a.en - b.en);

  const out: Bloque[] = [];
  let i = 0;
  while (i < items.length) {
    let j = i + 1;
    let clusterEnd = items[i].en;
    while (j < items.length && items[j].s < clusterEnd) {
      clusterEnd = Math.max(clusterEnd, items[j].en);
      j++;
    }
    const cluster = items.slice(i, j);
    const laneEnds: number[] = [];
    const laneOf: number[] = [];
    for (const it of cluster) {
      let lane = laneEnds.findIndex((end) => end <= it.s);
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(it.en); } else { laneEnds[lane] = it.en; }
      laneOf.push(lane);
    }
    const lanes = laneEnds.length;
    cluster.forEach((it, k) => out.push({ ...it, lane: laneOf[k], lanes }));
    i = j;
  }
  return out;
}

export function DayView({ eventos, esHoy, canAssign = false }: { eventos: CalEvento[]; esHoy: boolean; canAssign?: boolean }) {
  const [sel, setSel] = useState<CalEvento | null>(null);

  const conHora = eventos.filter((e) => e.hora);
  const sinHora = eventos.filter((e) => !e.hora);

  const starts = conHora.map((e) => Math.floor(toMin(e.hora) / 60));
  const ends = conHora.map((e) => Math.ceil((e.horaFin ? toMin(e.horaFin) : toMin(e.hora) + 60) / 60));
  const minH = Math.min(HORA_INICIO, ...(starts.length ? starts : [HORA_INICIO]));
  const maxH = Math.max(HORA_FIN, ...(ends.length ? ends : [HORA_FIN]));
  const hours = Array.from({ length: maxH - minH }, (_, i) => minH + i);
  const origin = minH * 60;
  const altura = hours.length * HOUR_H;

  const bloques = empaquetar(conHora);

  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const showNow = esHoy && nowMin >= origin && nowMin <= maxH * 60;
  const nowTop = ((nowMin - origin) / 60) * HOUR_H;

  return (
    <>
      {sinHora.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground text-xs">Sin hora:</span>
          {sinHora.map((e) => (
            <button key={e.id} type="button" onClick={() => setSel(e)} className={`rounded-md border px-2 py-1 text-xs ${eventoBg(e)}${e.cancelada ? " line-through opacity-50" : ""}`}>
              {e.titulo}
            </button>
          ))}
        </div>
      )}

      <div className="bg-card overflow-hidden rounded-xl border shadow-sm">
        <div className="flex">
          {/* Columna de horas */}
          <div className="w-14 shrink-0">
            {hours.map((h) => (
              <div key={h} className="text-muted-foreground border-t px-1 text-right text-xs tabular-nums" style={{ height: HOUR_H }}>
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>
          {/* Pista de eventos */}
          <div className="relative flex-1 border-l" style={{ height: altura }}>
            {hours.map((h, i) => (
              <div key={h} className="border-border/50 absolute inset-x-0 border-t" style={{ top: i * HOUR_H }} />
            ))}
            {showNow && <div className="bg-destructive absolute inset-x-0 z-20 h-px" style={{ top: nowTop }} />}
            {bloques.map(({ ev, s, en, lane, lanes }) => {
              const top = ((s - origin) / 60) * HOUR_H;
              const height = Math.max(((en - s) / 60) * HOUR_H - 2, 18);
              return (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => setSel(ev)}
                  title={`${ev.hora}${ev.horaFin ? `–${ev.horaFin}` : ""} · ${ev.titulo}`}
                  className={`hover:ring-lime absolute overflow-hidden rounded-md px-1.5 py-0.5 text-left text-xs shadow-xs hover:z-30 hover:ring-2 ${eventoBg(ev)}${ev.cancelada ? " line-through opacity-50" : ""}${ev.fuente === "easycancha" ? " border-foreground/30 border-l-2" : ""}`}
                  style={{
                    top,
                    height,
                    left: `calc(${(lane / lanes) * 100}% + 2px)`,
                    width: `calc(${100 / lanes}% - 4px)`,
                  }}
                >
                  <span className="block leading-tight font-medium">{ev.hora}{ev.horaFin ? `–${ev.horaFin}` : ""}</span>
                  <span className="block truncate leading-tight">{ev.titulo}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <Dialog open={!!sel} onOpenChange={(o) => !o && setSel(null)}>
        <DialogContent>{sel && <EventoDetalle ev={sel} canAssign={canAssign} />}</DialogContent>
      </Dialog>
    </>
  );
}
