"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

type Dia = { fecha: string; label: string; monto: number; esHoy: boolean };

/** Juegos por día: barras verticales de la semana; la de hoy juega en lima. */
export function ChartBarrasSemana({ dias }: { dias: Dia[] }) {
  const [crecido, setCrecido] = useState(false);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setCrecido(true);
      return;
    }
    const t = requestAnimationFrame(() => requestAnimationFrame(() => setCrecido(true)));
    return () => cancelAnimationFrame(t);
  }, []);

  const max = Math.max(1, ...dias.map((d) => d.monto));

  return (
    <div className="flex h-48 items-end justify-between gap-3 sm:gap-4">
      {dias.map((d, i) => {
        const pct = Math.max(d.monto > 0 ? 6 : 2, (d.monto / max) * 100);
        return (
          <div key={d.fecha} className="group flex h-full flex-1 flex-col items-center justify-end gap-2" title={`${d.fecha} · ${COP.format(d.monto)}`}>
            <span className="text-foreground/80 text-[11px] font-medium tabular-nums opacity-0 transition-opacity group-hover:opacity-100">
              {COP.format(d.monto)}
            </span>
            <div className="bg-muted flex w-full max-w-9 flex-1 items-end overflow-hidden rounded-lg">
              <div
                className={cn(
                  "w-full rounded-lg transition-[height] duration-700 ease-out",
                  d.esHoy ? "bg-primary" : "bg-charcoal/75 group-hover:bg-charcoal",
                )}
                style={{ height: crecido ? `${pct}%` : "2%", transitionDelay: `${i * 70}ms` }}
              />
            </div>
            <span className={cn("text-[11px] capitalize", d.esHoy ? "text-foreground font-semibold" : "text-muted-foreground")}>
              {d.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
