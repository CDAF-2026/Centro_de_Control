"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

type Segmento = { nombre: string; total: number; color: string };

/** Composición del ingreso: dona por servicio (colores del catálogo) con leyenda. */
export function ChartDonut({ segmentos, totalLabel = "del periodo" }: { segmentos: Segmento[]; totalLabel?: string }) {
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
  const piezas = otros > 0 ? [...top, { nombre: "Otros", total: otros, color: "#c8ccc4" }] : top;

  const R = 15.915; // r tal que la circunferencia = 100 (porcentajes directos)
  let acumulado = 0;

  return (
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
  );
}
