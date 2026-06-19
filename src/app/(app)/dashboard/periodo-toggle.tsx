import Link from "next/link";
import { cn } from "@/lib/utils";

const OPCIONES = [
  { key: "semana", label: "Semana" },
  { key: "mes", label: "Mes" },
  { key: "3m", label: "3 meses" },
] as const;

/** Control segmentado para el periodo global del dashboard (server, vía searchParams). */
export function PeriodoToggle({ periodo }: { periodo: string }) {
  return (
    <div className="bg-muted inline-flex items-center gap-1 rounded-lg p-1">
      {OPCIONES.map((o) => {
        const active = o.key === periodo;
        return (
          <Link
            key={o.key}
            href={`/dashboard?periodo=${o.key}`}
            aria-current={active ? "true" : undefined}
            className={cn(
              "rounded-md px-3 py-1 text-sm font-medium transition-colors",
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}
