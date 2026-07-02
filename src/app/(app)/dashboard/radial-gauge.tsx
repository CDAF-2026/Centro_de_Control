"use client";

import { useEffect, useState } from "react";
import { CountUp } from "./count-up";

/** Medidor de recaudo: arco lima que avanza hasta el % cobrado del periodo. */
export function RadialGauge({ pct }: { pct: number }) {
  const [activo, setActivo] = useState(false);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setActivo(true);
      return;
    }
    const t = requestAnimationFrame(() => requestAnimationFrame(() => setActivo(true)));
    return () => cancelAnimationFrame(t);
  }, []);

  const R = 15.915;
  const objetivo = Math.max(0, Math.min(100, pct));

  return (
    <div className="relative size-36">
      <svg viewBox="0 0 42 42" className="size-full -rotate-90">
        <circle cx="21" cy="21" r={R} fill="none" strokeWidth="5.5" className="stroke-muted" />
        <circle
          cx="21"
          cy="21"
          r={R}
          fill="none"
          strokeWidth="5.5"
          strokeLinecap="round"
          className="stroke-primary"
          strokeDasharray={`${activo ? objetivo : 0} ${100 - (activo ? objetivo : 0)}`}
          style={{ transition: "stroke-dasharray 1100ms cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <CountUp value={Math.round(objetivo)} format="pct" durationMs={1100} className="font-heading text-2xl font-semibold tracking-tight" />
        <span className="text-muted-foreground text-[11px]">cobrado</span>
      </div>
    </div>
  );
}
