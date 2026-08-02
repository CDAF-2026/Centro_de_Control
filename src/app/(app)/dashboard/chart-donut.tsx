"use client";

import { useEffect, useState } from "react";
import { List } from "lucide-react";
import { cn } from "@/lib/utils";
import { COLOR_SERVICIO_DEFAULT } from "@/lib/finanzas";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

type Segmento = { nombre: string; total: number; color: string };

/** Composición del ingreso: dona por servicio (colores del catálogo) con leyenda. */
export function ChartDonut({
  segmentos,
  totalLabel = "del periodo",
  subtitulo,
}: {
  segmentos: Segmento[];
  totalLabel?: string;
  subtitulo?: string;
}) {
  const [activo, setActivo] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setActivo(true);
      return;
    }
    const t = requestAnimationFrame(() => requestAnimationFrame(() => setActivo(true)));
    return () => cancelAnimationFrame(t);
  }, []);

  const total = segmentos.reduce((s, x) => s + x.total, 0);
  if (total <= 0) return null;

  // Top 5 + "Otros" para que la dona respire.
  const top = segmentos.slice(0, 5);
  const resto = segmentos.slice(5);
  const otros = resto.reduce((s, x) => s + x.total, 0);
  const piezas = otros > 0 ? [...top, { nombre: "Otros", total: otros, color: COLOR_SERVICIO_DEFAULT }] : top;
  const pctFmt = (v: number) => {
    const p = (v / total) * 100;
    return p > 0 && p < 1 ? "<1%" : `${Math.round(p)}%`;
  };
  const maxSeg = Math.max(...segmentos.map((s) => s.total));

  const R = 15.915; // r tal que la circunferencia = 100 (porcentajes directos)
  let acumulado = 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
        <div className="relative size-44 shrink-0">
          <svg viewBox="0 0 42 42" className="size-full -rotate-90">
            <circle cx="21" cy="21" r={R} fill="none" strokeWidth="6" className="stroke-muted" />
            {piezas.map((p, i) => {
              const pct = (p.total / total) * 100;
              const offset = acumulado;
              acumulado += pct;
              const dim = hover !== null && hover !== p.nombre;
              return (
                <circle
                  key={p.nombre}
                  cx="21"
                  cy="21"
                  r={R}
                  fill="none"
                  stroke={p.color}
                  strokeWidth={hover === p.nombre ? 7 : 6}
                  strokeLinecap="butt"
                  strokeDasharray={activo ? `${Math.max(pct - 0.6, 0.4)} ${100 - Math.max(pct - 0.6, 0.4)}` : `0 100`}
                  strokeDashoffset={-offset}
                  style={{ opacity: dim ? 0.35 : 1, transition: `stroke-dasharray 900ms cubic-bezier(0.22,1,0.36,1) ${i * 90}ms, opacity 200ms ease, stroke-width 200ms ease` }}
                  onMouseEnter={() => setHover(p.nombre)}
                  onMouseLeave={() => setHover(null)}
                />
              );
            })}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            {hover ? (
              <>
                <span className="text-muted-foreground max-w-24 truncate text-[11px]">{hover}</span>
                <span className="font-heading text-sm font-semibold tabular-nums">
                  {Math.round(((piezas.find((p) => p.nombre === hover)?.total ?? 0) / total) * 100)}%
                </span>
              </>
            ) : (
              <>
                <span className="font-heading text-lg font-semibold tracking-tight tabular-nums">{COP.format(total)}</span>
                <span className="text-muted-foreground text-[11px]">{totalLabel}</span>
              </>
            )}
          </div>
        </div>

        <ul className="w-full min-w-0 flex-1 space-y-1.5">
          {piezas.map((p) => (
            <li
              key={p.nombre}
              onMouseEnter={() => setHover(p.nombre)}
              onMouseLeave={() => setHover(null)}
              className={cn(
                "flex items-center justify-between gap-3 rounded-md px-2 py-1 text-sm transition-colors",
                hover === p.nombre && "bg-muted/60",
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: p.color }} />
                <span className="truncate">{p.nombre}</span>
              </span>
              <span className="shrink-0 tabular-nums">
                <span className="text-muted-foreground mr-2 text-xs">{COP.format(p.total)}</span>
                <span className="font-medium">{Math.round((p.total / total) * 100)}%</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {resto.length > 0 && (
        <div className="flex justify-end">
          <Dialog>
            <DialogTrigger className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 rounded-md text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              <List className="size-3.5" />
              Ver todas las categorías ({segmentos.length})
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Composición del ingreso</DialogTitle>
                {subtitulo && <DialogDescription>Por servicio · {subtitulo}</DialogDescription>}
              </DialogHeader>

              <div className="flex items-baseline justify-between border-b pb-3">
                <span className="text-muted-foreground text-sm">Total del periodo</span>
                <span className="font-heading text-lg font-semibold tracking-tight tabular-nums">{COP.format(total)}</span>
              </div>

              <ul className="-mr-2 max-h-[55vh] space-y-2.5 overflow-y-auto pr-2">
                {segmentos.map((seg) => (
                  <li key={seg.nombre} className="space-y-1">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: seg.color }} />
                        <span className="truncate">{seg.nombre}</span>
                      </span>
                      <span className="shrink-0 tabular-nums">
                        <span className="text-muted-foreground mr-2 text-xs">{COP.format(seg.total)}</span>
                        <span className="font-medium">{pctFmt(seg.total)}</span>
                      </span>
                    </div>
                    <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.max((seg.total / maxSeg) * 100, 2)}%`, backgroundColor: seg.color }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  );
}
