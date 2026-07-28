"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
/** Cifra compacta para espacios estrechos: $ 191,4 M. */
const corto = (n: number) =>
  n >= 1_000_000
    ? `$ ${(n / 1_000_000).toFixed(1).replace(".", ",")} M`
    : n >= 1_000
      ? `$ ${Math.round(n / 1_000)} mil`
      : `$ ${n}`;

export type SerieComp = {
  /** Nombre corto del periodo ("Julio", "Este periodo"). */
  label: string;
  /** Rango legible para el pie ("1–27 jul"). */
  rango: string;
  /** Facturado acumulado día a día. */
  acum: number[];
};

/**
 * Comparativo de FACTURADO (no cobrado): acumulado del periodo actual contra el
 * inmediatamente anterior, alineados por día. Al ser acumulado, cada línea termina
 * exactamente en el total facturado del periodo, así se lee de un vistazo tanto el
 * total como el ritmo (si vamos por encima o por debajo del periodo pasado).
 */
export function ChartComparativo({ actual, previo }: { actual: SerieComp; previo: SerieComp }) {
  const [hover, setHover] = useState<number | null>(null);

  const nA = actual.acum.length;
  const nP = previo.acum.length;
  const n = Math.max(nA, nP);
  const totalA = nA ? actual.acum[nA - 1] : 0;
  const totalP = nP ? previo.acum[nP - 1] : 0;
  const delta = totalP > 0 ? ((totalA - totalP) / totalP) * 100 : null;

  const W = 300;
  const H = 120;
  const PADX = 3;
  const TOPM = 8;
  const BOTM = 4;
  const max = Math.max(1, totalA, totalP);
  const X = (i: number) => PADX + (n > 1 ? i / (n - 1) : 0.5) * (W - 2 * PADX);
  const Y = (v: number) => TOPM + (1 - v / max) * (H - TOPM - BOTM);

  const path = (vals: number[]) =>
    vals.length < 2 ? "" : vals.map((v, i) => `${i === 0 ? "M" : "L"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  const pathA = path(actual.acum);
  const pathP = path(previo.acum);

  // Banda entre las dos curvas, coloreada por signo: sin ella la brecha se pierde,
  // porque dos acumulados con totales parecidos recorren casi el mismo camino.
  // Verde = el periodo va por ENCIMA del anterior; rojo = por debajo. Se corta en el
  // punto exacto de cruce para que el color no invada el tramo contrario.
  const m = Math.min(nA, nP);
  const arriba: string[] = [];
  const abajo: string[] = [];
  for (let i = 0; i < m - 1; i++) {
    const a0 = actual.acum[i];
    const a1 = actual.acum[i + 1];
    const p0 = previo.acum[i];
    const p1 = previo.acum[i + 1];
    const d0 = a0 - p0;
    const d1 = a1 - p1;
    if (d0 === 0 && d1 === 0) continue;
    const x0 = X(i).toFixed(1);
    const x1 = X(i + 1).toFixed(1);
    if (d0 >= 0 === d1 >= 0) {
      const quad = `M${x0},${Y(a0).toFixed(1)} L${x1},${Y(a1).toFixed(1)} L${x1},${Y(p1).toFixed(1)} L${x0},${Y(p0).toFixed(1)} Z`;
      (d0 + d1 >= 0 ? arriba : abajo).push(quad);
    } else {
      const t = d0 / (d0 - d1); // cruce entre ambas curvas
      const xc = (X(i) + (X(i + 1) - X(i)) * t).toFixed(1);
      const yc = Y(a0 + (a1 - a0) * t).toFixed(1);
      (d0 >= 0 ? arriba : abajo).push(`M${x0},${Y(a0).toFixed(1)} L${xc},${yc} L${x0},${Y(p0).toFixed(1)} Z`);
      (d1 >= 0 ? arriba : abajo).push(`M${xc},${yc} L${x1},${Y(a1).toFixed(1)} L${x1},${Y(p1).toFixed(1)} Z`);
    }
  }

  if (n < 2) return null;

  // Valores bajo el cursor (o el cierre del periodo en reposo).
  const iA = Math.min(hover ?? nA - 1, nA - 1);
  const iP = Math.min(hover ?? nP - 1, nP - 1);
  const vA = actual.acum[iA] ?? 0;
  const vP = previo.acum[iP] ?? 0;
  const leftPct = (X(hover ?? n - 1) / W) * 100;

  const sube = (delta ?? 0) >= 0;

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Titular: total facturado del periodo + variación */}
      <div>
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className="font-heading text-3xl font-bold tracking-tight tabular-nums">{COP.format(totalA)}</span>
          {delta !== null && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 text-sm font-semibold tabular-nums",
                sube ? "text-[#46530a]" : "text-destructive",
              )}
            >
              {sube ? "▲" : "▼"} {sube ? "+" : ""}
              {delta.toFixed(1).replace(".", ",")}%
            </span>
          )}
        </div>
        <p className="text-muted-foreground mt-0.5 text-xs">
          Facturado · {actual.rango}
          {delta !== null && <> vs. {previo.rango}</>}
        </p>
      </div>

      {/* Curvas acumuladas */}
      <div
        className="relative min-h-[130px] flex-1"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const i = Math.round(((e.clientX - r.left) / r.width) * (n - 1));
          setHover(Math.max(0, Math.min(n - 1, i)));
        }}
      >
        <div key={pathA + pathP} className="cdaf-revelar-x absolute inset-0">
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="size-full">
            {abajo.length > 0 && <path d={abajo.join(" ")} className="fill-destructive/20" />}
            {arriba.length > 0 && <path d={arriba.join(" ")} className="fill-primary/45" />}
            {/* Periodo anterior: punteado y apagado (es la referencia, no el protagonista). */}
            {pathP && (
              <path
                d={pathP}
                fill="none"
                className="stroke-muted-foreground/55"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {/* Periodo actual: sólido. */}
            {pathA && (
              <path
                d={pathA}
                fill="none"
                className="stroke-charcoal"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
        </div>

        {/* Guía + puntos (HTML: no se deforman con el estirado del SVG). */}
        <div
          className="bg-foreground/15 pointer-events-none absolute inset-y-0 w-px transition-opacity"
          style={{ left: `${leftPct}%`, opacity: hover !== null ? 1 : 0 }}
        />
        <div
          className="border-card bg-muted-foreground/70 pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border"
          style={{ left: `${(X(iP) / W) * 100}%`, top: `${(Y(vP) / H) * 100}%` }}
        />
        <div
          className="border-card bg-primary cdaf-aparecer-tarde pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
          style={{ left: `${(X(iA) / W) * 100}%`, top: `${(Y(vA) / H) * 100}%` }}
        />
      </div>

      {/* Leyenda con los dos totales (o los valores del día bajo el cursor) */}
      <dl className="space-y-1 border-t pt-2 text-xs">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground flex min-w-0 items-center gap-1.5">
            <span className="bg-charcoal h-0.5 w-3.5 shrink-0 rounded-full" />
            <span className="truncate">{actual.label}</span>
          </dt>
          <dd className="font-semibold tabular-nums">{COP.format(vA)}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground flex min-w-0 items-center gap-1.5">
            <span className="border-muted-foreground/60 w-3.5 shrink-0 border-t border-dashed" />
            <span className="truncate">{previo.label}</span>
          </dt>
          <dd className="text-muted-foreground font-medium tabular-nums">{COP.format(vP)}</dd>
        </div>
        <p className="text-muted-foreground/70 pt-0.5 text-[11px]">
          {hover !== null ? (
            <>
              Día {hover + 1} · diferencia{" "}
              <strong className={cn("tabular-nums", vA >= vP ? "text-[#46530a]" : "text-destructive")}>
                {vA >= vP ? "+" : "−"}
                {corto(Math.abs(vA - vP))}
              </strong>
            </>
          ) : (
            "Acumulado día a día · pasa el cursor para comparar"
          )}
        </p>
      </dl>
    </div>
  );
}
