"use client";

import { useState } from "react";
import Link from "next/link";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EventoDetalle } from "./evento-detalle";
import { eventoBg, type CalEvento } from "./types";

const DOW = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function chipClass(ev: CalEvento) {
  const cancel = ev.cancelada ? " line-through opacity-50" : "";
  const ec = ev.fuente === "easycancha" ? " border-foreground/30 border-l-2" : "";
  return `${eventoBg(ev)}${cancel}${ec}`;
}

export function CalendarGrid({
  year,
  month,
  deporte,
  eventos,
  canAssign = false,
}: {
  year: number;
  month: number;
  deporte: string;
  eventos: CalEvento[];
  canAssign?: boolean;
}) {
  const [sel, setSel] = useState<CalEvento | null>(null);

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const offset = (firstWeekday + 6) % 7;
  const cells: (number | null)[] = [
    ...Array(offset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const byDay = new Map<number, CalEvento[]>();
  for (const e of eventos) {
    if (!byDay.has(e.dia)) byDay.set(e.dia, []);
    byDay.get(e.dia)!.push(e);
  }
  for (const arr of byDay.values()) arr.sort((a, b) => a.hora.localeCompare(b.hora));

  const mm = String(month).padStart(2, "0");
  const dep = deporte ? `&deporte=${deporte}` : "";
  const dayHref = (d: number) => `/clases?vista=dia&date=${year}-${mm}-${String(d).padStart(2, "0")}${dep}`;

  const now = new Date();
  const esMesActual = year === now.getFullYear() && month === now.getMonth() + 1;
  const hoyDia = now.getDate();

  return (
    <>
      <div className="bg-border grid grid-cols-7 gap-px overflow-hidden rounded-xl border shadow-sm">
        {DOW.map((d) => (
          <div key={d} className="bg-muted text-muted-foreground px-2 py-1.5 text-center text-xs font-semibold tracking-wide uppercase">{d}</div>
        ))}
        {cells.map((day, i) => {
          const items = day ? byDay.get(day) ?? [] : [];
          const esHoy = !!day && esMesActual && day === hoyDia;
          return (
            <div key={i} className={`min-h-24 p-1 ${esHoy ? "bg-lime/10 ring-lime ring-2 ring-inset" : "bg-card"}`}>
              {day && (
                <>
                  <Link
                    href={dayHref(day)}
                    title={esHoy ? "Hoy" : undefined}
                    className={
                      esHoy
                        ? "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-lime px-1 text-xs font-bold text-[#1a1c1e]"
                        : "text-muted-foreground hover:text-foreground inline-block text-xs font-medium"
                    }
                  >
                    {day}
                  </Link>
                  <div className="space-y-0.5">
                    {items.slice(0, 3).map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => setSel(e)}
                        title={`${e.hora} · ${e.titulo}`}
                        className={`hover:ring-lime block w-full truncate rounded-md px-1.5 py-0.5 text-left text-xs shadow-xs hover:ring-2 ${chipClass(e)}`}
                      >
                        {e.chip}
                      </button>
                    ))}
                    {items.length > 3 && (
                      <Link
                        href={dayHref(day)}
                        className="text-muted-foreground hover:text-foreground block text-xs"
                      >
                        +{items.length - 3} más
                      </Link>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <Dialog open={!!sel} onOpenChange={(o) => !o && setSel(null)}>
        <DialogContent>
          {sel && <EventoDetalle ev={sel} canAssign={canAssign} onCerrar={() => setSel(null)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
