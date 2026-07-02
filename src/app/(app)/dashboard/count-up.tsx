"use client";

import { useEffect, useRef, useState } from "react";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const NUM = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

/** Número de marcador: sube animado hasta el valor (respeta prefers-reduced-motion). */
export function CountUp({
  value,
  format = "cop",
  durationMs = 900,
  className,
}: {
  value: number;
  format?: "cop" | "num" | "pct";
  durationMs?: number;
  className?: string;
}) {
  const [mostrado, setMostrado] = useState(0);
  const raf = useRef<number>(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setMostrado(value);
      return;
    }
    const inicio = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - inicio) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cúbico, como marcador que frena
      setMostrado(Math.round(value * eased));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, durationMs]);

  const texto = format === "cop" ? COP.format(mostrado) : format === "pct" ? `${mostrado}%` : NUM.format(mostrado);
  return (
    <span className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {texto}
    </span>
  );
}
