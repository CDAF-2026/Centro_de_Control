import { COLOR_FAMILIA, type FamiliaIngreso } from "@/lib/finanzas";

const COP0 = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const miles = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toLocaleString("es-CO", { maximumFractionDigits: 1 })}M`
    : n >= 1000
      ? `${Math.round(n / 1000)}k`
      : String(n);

export type ChartBucket = {
  label: string;
  total: number;
  segments: { familia: FamiliaIngreso; monto: number }[];
};

/** Gráfico de barras apiladas (CSS, sin dependencias) de ingresos por tipo en el tiempo. */
export function IngresosChart({
  buckets,
  familias,
}: {
  buckets: ChartBucket[];
  familias: { nombre: FamiliaIngreso; total: number }[];
}) {
  const max = Math.max(1, ...buckets.map((b) => b.total));
  const H = 176;
  return (
    <div>
      <div className="flex items-end justify-between gap-2" style={{ height: H }}>
        {buckets.map((b, i) => (
          <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1">
            <span className="text-muted-foreground text-[10px] tabular-nums">
              {b.total > 0 ? miles(b.total) : ""}
            </span>
            <div
              className="ring-foreground/[0.04] flex w-full max-w-[2.75rem] flex-col-reverse overflow-hidden rounded-md ring-1"
              style={{ height: Math.max((b.total / max) * (H - 26), b.total > 0 ? 4 : 2) }}
              title={`${b.label}: ${COP0.format(b.total)}`}
            >
              {b.total === 0 && <div className="bg-muted h-full w-full" />}
              {b.segments
                .filter((s) => s.monto > 0)
                .map((s) => (
                  <div
                    key={s.familia}
                    style={{ height: `${(s.monto / b.total) * 100}%`, backgroundColor: COLOR_FAMILIA[s.familia] }}
                    title={`${s.familia}: ${COP0.format(s.monto)}`}
                  />
                ))}
            </div>
            <span className="text-muted-foreground text-[10px] whitespace-nowrap">{b.label}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 border-t pt-3">
        {familias.map((f) => (
          <span key={f.nombre} className="flex items-center gap-1.5 text-xs">
            <span className="size-2.5 rounded-sm" style={{ backgroundColor: COLOR_FAMILIA[f.nombre] }} />
            <span className="text-muted-foreground">{f.nombre}</span>
            <span className="font-medium tabular-nums">{COP0.format(f.total)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
