"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const PRESETS = [
  { key: "semana", label: "Semana" },
  { key: "mes", label: "Mes" },
  { key: "3m", label: "3 meses" },
] as const;

const opcionCls = (active: boolean) =>
  cn(
    "rounded-md px-3 py-1 text-sm font-medium transition-colors",
    active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
  );

/** Selector de periodo del dashboard: presets + rango personalizado con calendario. */
export function PeriodoToggle({
  periodo,
  desde,
  hasta,
}: {
  periodo: string;
  desde?: string;
  hasta?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(periodo === "custom");
  const [d, setD] = useState(desde ?? "");
  const [h, setH] = useState(hasta ?? "");

  const ir = (key: string) => {
    setOpen(false);
    router.push(`/dashboard?periodo=${key}`);
  };
  const aplicar = () => {
    if (d && h) router.push(`/dashboard?periodo=custom&desde=${d}&hasta=${h}`);
  };

  return (
    <div className="relative">
      <div className="bg-muted inline-flex items-center gap-1 rounded-lg p-1">
        {PRESETS.map((o) => (
          <button key={o.key} type="button" onClick={() => ir(o.key)} className={opcionCls(periodo === o.key)}>
            {o.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={cn(opcionCls(periodo === "custom"), "flex items-center gap-1.5")}
        >
          <CalendarRange className="size-3.5" />
          Personalizado
        </button>
      </div>

      {open && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-20 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="bg-popover absolute right-0 z-30 mt-2 w-72 rounded-xl p-3 shadow-lg ring-1 ring-foreground/10">
            <p className="mb-2 text-sm font-medium">Rango personalizado</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-muted-foreground text-xs">Fecha inicio</span>
                <input
                  type="date"
                  value={d}
                  max={h || undefined}
                  onChange={(e) => setD(e.target.value)}
                  className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                />
              </label>
              <label className="space-y-1">
                <span className="text-muted-foreground text-xs">Fecha fin</span>
                <input
                  type="date"
                  value={h}
                  min={d || undefined}
                  onChange={(e) => setH(e.target.value)}
                  className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                />
              </label>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="button" size="sm" onClick={aplicar} disabled={!d || !h}>
                Aplicar
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
