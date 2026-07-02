"use client";

import { useEffect, useRef, useState } from "react";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

type Punto = { fecha: string; monto: number };

/** Línea de juego: el ingreso diario del periodo se dibuja como el recorrido de un partido. */
export function ChartArea({ puntos, height = 96 }: { puntos: Punto[]; height?: number }) {
  const pathRef = useRef<SVGPathElement>(null);
  const [dibujado, setDibujado] = useState(false);
  const [hover, setHover] = useState<number | null>(null);

  const W = 600;
  const H = 100;
  const max = Math.max(1, ...puntos.map((p) => p.monto));
  const x = (i: number) => (puntos.length > 1 ? (i / (puntos.length - 1)) * W : W / 2);
  const y = (m: number) => H - 6 - (m / max) * (H - 14);

  const linea = puntos.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.monto).toFixed(1)}`).join(" ");
  const area = `${linea} L${W},${H} L0,${H} Z`;

  useEffect(() => {
    const el = pathRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDibujado(true);
      return;
    }
    const largo = el.getTotalLength();
    el.style.strokeDasharray = `${largo}`;
    el.style.strokeDashoffset = `${largo}`;
    // forzar layout y animar el trazo
    el.getBoundingClientRect();
    el.style.transition = "stroke-dashoffset 1100ms cubic-bezier(0.22, 1, 0.36, 1)";
    el.style.strokeDashoffset = "0";
    const t = setTimeout(() => setDibujado(true), 1100);
    return () => clearTimeout(t);
  }, [linea]);

  if (puntos.length < 2) return null;
  const ultimo = puntos[puntos.length - 1];

  return (
    <div className="relative" style={{ height }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="size-full"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const i = Math.round(((e.clientX - r.left) / r.width) * (puntos.length - 1));
          setHover(Math.max(0, Math.min(puntos.length - 1, i)));
        }}
      >
        <path d={area} className="fill-charcoal/[0.07]" style={{ opacity: dibujado ? 1 : 0, transition: "opacity 500ms ease" }} />
        <path ref={pathRef} d={linea} fill="none" className="stroke-charcoal" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        {hover !== null && (
          <line x1={x(hover)} y1={4} x2={x(hover)} y2={H} className="stroke-foreground/20" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        )}
        <circle
          cx={x(hover ?? puntos.length - 1)}
          cy={y(puntos[hover ?? puntos.length - 1].monto)}
          r={4}
          className="fill-primary stroke-card"
          strokeWidth={2}
          style={{ opacity: dibujado ? 1 : 0, transition: "opacity 300ms ease" }}
        />
      </svg>
      <div className="text-muted-foreground pointer-events-none absolute inset-x-0 -bottom-5 flex justify-between text-[11px]">
        <span>{puntos[0].fecha.slice(5)}</span>
        <span className="text-foreground font-medium">
          {hover !== null ? `${puntos[hover].fecha.slice(5)} · ${COP.format(puntos[hover].monto)}` : `${ultimo.fecha.slice(5)} · ${COP.format(ultimo.monto)}`}
        </span>
      </div>
    </div>
  );
}
