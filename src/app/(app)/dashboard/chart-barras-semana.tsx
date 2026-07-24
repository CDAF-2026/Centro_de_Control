"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

type Categoria = { nombre: string; total: number; color: string };
type Dia = {
  fecha: string;
  label: string;
  fechaLarga: string;
  monto: number;
  facturas: number;
  esHoy: boolean;
  detalle: Categoria[];
};

/** Juegos por día: barras verticales de la semana; la de hoy juega en lima. Clic → detalle por servicio. */
export function ChartBarrasSemana({ dias }: { dias: Dia[] }) {
  const [crecido, setCrecido] = useState(false);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Dia | null>(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setCrecido(true);
      return;
    }
    const t = requestAnimationFrame(() => requestAnimationFrame(() => setCrecido(true)));
    return () => cancelAnimationFrame(t);
  }, []);

  const max = Math.max(1, ...dias.map((d) => d.monto));
  const abrir = (d: Dia) => {
    setSel(d);
    setOpen(true);
  };
  const maxCat = Math.max(1, ...(sel?.detalle ?? []).map((c) => c.total));

  return (
    <>
      <div className="flex h-48 items-end justify-between gap-3 sm:gap-4">
        {dias.map((d, i) => {
          const pct = Math.max(d.monto > 0 ? 6 : 2, (d.monto / max) * 100);
          // Hoy sin facturas = Siigo aún no cargó el día (rezago de ~1 día): no es $0 real, va "en curso".
          const pendiente = d.esHoy && d.facturas === 0;
          return (
            <button
              key={d.fecha}
              type="button"
              onClick={() => abrir(d)}
              title={
                pendiente
                  ? `${d.fecha} · en curso · Siigo registra la facturación al día siguiente`
                  : `${d.fecha} · ${COP.format(d.monto)} · toca para ver el detalle`
              }
              className="group flex h-full flex-1 cursor-pointer flex-col items-center justify-end gap-2 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {pendiente ? (
                <span className="text-[10px] font-semibold text-[#46530a]">en curso</span>
              ) : (
                <span className="text-foreground/80 text-[11px] font-medium tabular-nums opacity-0 transition-opacity group-hover:opacity-100">
                  {COP.format(d.monto)}
                </span>
              )}
              <div className="bg-muted flex w-full max-w-9 flex-1 items-end overflow-hidden rounded-lg">
                {pendiente ? (
                  <div className="border-primary/60 bg-primary/10 m-0.5 flex-1 self-stretch rounded-md border border-dashed" />
                ) : (
                  <div
                    className={cn(
                      "w-full rounded-lg transition-[height] duration-700 ease-out",
                      d.esHoy ? "bg-primary" : "bg-charcoal/75 group-hover:bg-charcoal",
                    )}
                    style={{ height: crecido ? `${pct}%` : "2%", transitionDelay: `${i * 70}ms` }}
                  />
                )}
              </div>
              <span className={cn("text-[11px] capitalize", d.esHoy ? "text-foreground font-semibold" : "text-muted-foreground")}>
                {d.label}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-muted-foreground/70 mt-3 text-center text-[11px]">Toca un día para ver el detalle por servicio</p>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          {sel && (
            <>
              <DialogHeader>
                <DialogTitle className="first-letter:uppercase">{sel.fechaLarga}</DialogTitle>
                <DialogDescription>
                  {sel.esHoy && sel.facturas === 0
                    ? "En curso · pendiente de Siigo"
                    : `${COP.format(sel.monto)} · ${sel.facturas} factura${sel.facturas === 1 ? "" : "s"}`}
                </DialogDescription>
              </DialogHeader>

              {sel.esHoy && sel.facturas === 0 ? (
                <p className="text-muted-foreground py-6 text-center text-sm">
                  Día en curso. Siigo suele registrar la facturación de hoy al día siguiente, así que este
                  valor se completará mañana.
                </p>
              ) : sel.detalle.length > 0 ? (
                <ul className="-mr-2 max-h-[55vh] space-y-2.5 overflow-y-auto pr-2">
                  {sel.detalle.map((c) => (
                    <li key={c.nombre} className="space-y-1">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: c.color }} />
                          <span className="truncate">{c.nombre}</span>
                        </span>
                        <span className="shrink-0 tabular-nums">
                          <span className="text-muted-foreground mr-2 text-xs">{COP.format(c.total)}</span>
                          <span className="font-medium">{Math.round((c.total / sel.monto) * 100)}%</span>
                        </span>
                      </div>
                      <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                        <div className="h-full rounded-full" style={{ width: `${Math.max((c.total / maxCat) * 100, 2)}%`, backgroundColor: c.color }} />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground py-6 text-center text-sm">Sin ingresos pagados ese día.</p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
