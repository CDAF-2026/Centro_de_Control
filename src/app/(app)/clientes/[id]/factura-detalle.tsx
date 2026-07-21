"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const FECHA_LARGA = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric" });

export type FacturaDetalleData = {
  numero: string;
  fecha: string;
  total: number;
  saldo: number;
  lineas: { codigo: string | null; descripcion: string | null; cantidad: number; monto: number; servicio: string }[];
};

/** Cantidad sin decimales inútiles: 4.00 → 4; 1.50 → 1,5 */
const cant = (n: number) => (Number.isInteger(n) ? String(n) : n.toLocaleString("es-CO"));

/** Número de factura clicable: abre el detalle con sus líneas tal como vienen de Siigo. */
export function FacturaLink({ factura }: { factura: FacturaDetalleData }) {
  const pagado = factura.total - factura.saldo;
  return (
    <Dialog>
      <DialogTrigger className="text-foreground hover:text-primary cursor-pointer font-medium underline decoration-dotted underline-offset-2 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        {factura.numero}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Factura {factura.numero}</DialogTitle>
          <DialogDescription className="first-letter:uppercase">
            {FECHA_LARGA.format(new Date(`${factura.fecha}T00:00:00`))} · Tal como está en Siigo
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2 border-y py-2.5 text-center text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Total</p>
            <p className="font-medium tabular-nums">{COP.format(factura.total)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Pagado</p>
            <p className="font-medium tabular-nums">{COP.format(pagado)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Pendiente</p>
            <p className={`font-semibold tabular-nums ${factura.saldo > 0 ? "text-destructive" : ""}`}>
              {COP.format(factura.saldo)}
            </p>
          </div>
        </div>

        <ul className="-mr-2 max-h-[50vh] divide-y overflow-y-auto pr-2">
          {factura.lineas.map((l, i) => (
            <li key={`${l.codigo}-${i}`} className="flex items-start justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{l.descripcion ?? l.codigo ?? "—"}</p>
                <p className="text-muted-foreground text-xs">
                  {l.codigo ? `${l.codigo} · ` : ""}
                  {cant(l.cantidad)} und · {l.servicio}
                </p>
              </div>
              <span className="shrink-0 tabular-nums">{COP.format(l.monto)}</span>
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-between border-t pt-2.5 text-sm font-semibold">
          <span>Suma de las líneas</span>
          <span className="tabular-nums">{COP.format(factura.lineas.reduce((s, l) => s + l.monto, 0))}</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
