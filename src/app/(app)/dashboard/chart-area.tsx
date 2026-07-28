"use client";

import { useState } from "react";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

type Punto = { fecha: string; monto: number };

/**
 * Línea de juego: el ingreso diario del periodo se dibuja como el recorrido de un
 * partido. Con `fill` ocupa todo el alto disponible del contenedor (para no quedar
 * como una tira delgada en una tarjeta alta).
 *
 * La entrada se anima con `clip-path` por CSS (`.cdaf-revelar-x`), NO con
 * `stroke-dasharray`: el guion se mide en unidades del viewBox pero
 * `non-scaling-stroke` lo aplica en píxeles de pantalla, y como el SVG se estira sin
 * conservar proporción (`preserveAspectRatio="none"`) el guion se quedaba corto y la
 * cola de la línea desaparecía. Al ser animación CSS el estado final lo garantiza el
 * navegador: el gráfico nunca queda a medio dibujar.
 */
export function ChartArea({
  puntos,
  height = 96,
  fill = false,
}: {
  puntos: Punto[];
  height?: number;
  fill?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);

  // Recortar la cola de ceros del final (días de hoy que Siigo aún no cargó por el
  // rezago de ~1 día): no es que se haya facturado $0, es que faltan por llegar. Así
  // la línea no se desploma al piso en el borde derecho. Se conservan ≥2 puntos.
  let serie = puntos;
  let fin = puntos.length;
  while (fin > 2 && puntos[fin - 1].monto === 0) fin--;
  if (fin < puntos.length && puntos.slice(0, fin).some((p) => p.monto > 0)) serie = puntos.slice(0, fin);

  const W = 600;
  const H = 100;
  const PADX = 2; // aire lateral para que el punto/línea no se corten en los bordes
  const TOPM = 12; // aire arriba para que el pico no toque el techo
  const BOTM = 8; // aire abajo
  const n = serie.length;
  const max = Math.max(1, ...serie.map((p) => p.monto));
  const fx = (i: number) => (n > 1 ? i / (n - 1) : 0.5);
  const X = (i: number) => PADX + fx(i) * (W - 2 * PADX);
  const Y = (m: number) => TOPM + (1 - m / max) * (H - TOPM - BOTM);

  const linea = serie.map((p, i) => `${i === 0 ? "M" : "L"}${X(i).toFixed(1)},${Y(p.monto).toFixed(1)}`).join(" ");
  const area = `${linea} L${X(n - 1).toFixed(1)},${H} L${X(0).toFixed(1)},${H} Z`;

  if (n < 2) return null;
  const idx = hover ?? n - 1;
  const sel = serie[idx];
  const leftPct = (X(idx) / W) * 100;
  const topPct = (Y(sel.monto) / H) * 100;

  return (
    <div className={fill ? "flex h-full flex-col" : "flex flex-col"} style={fill ? undefined : { height }}>
      <div
        className="relative min-h-0 flex-1"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const i = Math.round(((e.clientX - r.left) / r.width) * (n - 1));
          setHover(Math.max(0, Math.min(n - 1, i)));
        }}
      >
        {/* `key` re-lanza la animación cuando cambian los datos (cambio de periodo). */}
        <div key={linea} className="cdaf-revelar-x absolute inset-0">
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="size-full">
            <path d={area} className="fill-charcoal/[0.07]" />
            <path
              d={linea}
              fill="none"
              className="stroke-charcoal"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>

        {/* Guía vertical (HTML, para que no se deforme con el estirado del SVG). */}
        <div
          className="bg-foreground/15 pointer-events-none absolute top-1 bottom-0 w-px transition-opacity"
          style={{ left: `${leftPct}%`, opacity: hover !== null ? 1 : 0 }}
        />
        {/* Punto: HTML redondo, nunca se recorta ni se vuelve elipse. */}
        <div
          className="border-card bg-primary cdaf-aparecer-tarde pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
          style={{ left: `${leftPct}%`, top: `${topPct}%` }}
        />
      </div>

      <div className="text-muted-foreground mt-1.5 flex justify-between text-[11px]">
        <span>{serie[0].fecha.slice(5)}</span>
        <span className="text-foreground font-medium">
          {sel.fecha.slice(5)} · {COP.format(sel.monto)}
        </span>
      </div>
    </div>
  );
}
