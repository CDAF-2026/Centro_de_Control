"use client";

import { useState } from "react";
import { COLOR_FAMILIA, type FamiliaIngreso } from "@/lib/finanzas";
import { cn } from "@/lib/utils";

const COP0 = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

/** Desglose de ingresos por tipo: barras horizontales ordenadas, fáciles de escanear. */
export function IngresosChart({
  familias,
  total,
}: {
  familias: { nombre: FamiliaIngreso; total: number }[];
  total: number;
}) {
  const [hover, setHover] = useState<FamiliaIngreso | null>(null);
  const max = Math.max(1, ...familias.map((f) => f.total));

  return (
    <div className="space-y-1">
      {familias.map((f) => {
        const pct = total > 0 ? Math.round((f.total / total) * 100) : 0;
        const activo = hover === f.nombre;
        return (
          <div
            key={f.nombre}
            onMouseEnter={() => setHover(f.nombre)}
            onMouseLeave={() => setHover(null)}
            className={cn(
              "grid grid-cols-[7rem_1fr_auto] items-center gap-3 rounded-md px-2 py-1.5 transition-colors sm:grid-cols-[11rem_1fr_auto]",
              activo && "bg-muted/60",
            )}
          >
            <span className="flex items-center gap-2 text-sm" title={f.nombre}>
              <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: COLOR_FAMILIA[f.nombre] }} />
              <span className="truncate">{f.nombre}</span>
            </span>
            <span className="bg-muted relative h-2.5 w-full overflow-hidden rounded-full">
              <span
                className="absolute inset-y-0 left-0 rounded-full transition-[width]"
                style={{
                  width: `${Math.max((f.total / max) * 100, 2)}%`,
                  backgroundColor: COLOR_FAMILIA[f.nombre],
                  filter: activo ? "brightness(1.08)" : undefined,
                }}
              />
            </span>
            <span className="text-right text-sm whitespace-nowrap tabular-nums">
              <span className="font-medium">{COP0.format(f.total)}</span>
              <span className="text-muted-foreground ml-1.5 text-xs">{pct}%</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
