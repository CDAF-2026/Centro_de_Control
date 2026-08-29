"use client";

import { useActionState } from "react";
import { Lock, LockOpen } from "lucide-react";
import { cerrarEvento, reabrirEvento, type EventoState } from "../actions";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const init: EventoState = {};

/**
 * Cerrar el evento congela su P&G y es lo que lo hace aparecer en el dashboard (como
 * utilidad, no como facturación bruta). Por eso va con confirmación: se avisa cuánto
 * queda por cobrar, porque el cierre se hace con el FACTURADO, no con el cobrado.
 */
export function CerrarEvento({
  eventoId,
  ingreso,
  costo,
  utilidad,
  pendienteCobro,
  mesImputacion,
  nCandidatas,
  montoCandidatas,
}: {
  eventoId: number;
  ingreso: number;
  costo: number;
  utilidad: number;
  pendienteCobro: number;
  /** Ya formateado en el servidor ("julio 2026"): `Intl` en español difiere entre Node y el navegador. */
  mesImputacion: string;
  /** Facturas que podrían ser del evento y siguen sueltas: cerrar sin ellas subestima el ingreso. */
  nCandidatas: number;
  montoCandidatas: number;
}) {
  const [state, action, pending] = useActionState(cerrarEvento, init);

  return (
    <Dialog>
      <DialogTrigger className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}>
        <Lock className="size-3.5" />
        Cerrar evento
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cerrar el evento</DialogTitle>
          <DialogDescription>
            Al cerrarlo se congela el resultado y el evento pasa a sumar en el dashboard.
          </DialogDescription>
        </DialogHeader>

        <dl className="divide-y rounded-lg border text-sm">
          <div className="flex items-center justify-between px-3 py-2">
            <dt className="text-muted-foreground">Ingresos facturados</dt>
            <dd className="tabular-nums">{COP.format(ingreso)}</dd>
          </div>
          <div className="flex items-center justify-between px-3 py-2">
            <dt className="text-muted-foreground">Costos (gastos + profesores)</dt>
            <dd className="tabular-nums">−{COP.format(costo)}</dd>
          </div>
          <div className="bg-muted/40 flex items-center justify-between px-3 py-2">
            <dt className="font-medium">Utilidad que entra al dashboard</dt>
            <dd className={cn("font-heading font-semibold tabular-nums", utilidad < 0 && "text-destructive")}>
              {COP.format(utilidad)}
            </dd>
          </div>
        </dl>

        <p className="text-muted-foreground text-xs">
          Se imputa a <strong className="text-foreground">{mesImputacion}</strong>, el mes del evento.
        </p>

        {nCandidatas > 0 && (
          <p className="border-warning/40 bg-warning/10 rounded-md border px-3 py-2 text-xs">
            Ojo: quedan <strong className="tabular-nums">{nCandidatas}</strong>{" "}
            {nCandidatas === 1 ? "factura" : "facturas"} por{" "}
            <strong className="tabular-nums">{COP.format(montoCandidatas)}</strong> que podrían ser de este
            evento y no están atadas. Si alguna lo es, ciérralo después de atarla: si no, su ingreso queda
            subestimado y la utilidad que se publica sale más baja de lo real.
          </p>
        )}

        {pendienteCobro > 0 && (
          <p className="border-warning/40 bg-warning/10 rounded-md border px-3 py-2 text-xs">
            Quedan <strong className="tabular-nums">{COP.format(pendienteCobro)}</strong> por cobrar. El cierre usa
            lo <strong>facturado</strong>, así que esa plata ya cuenta como ingreso del evento y sigue apareciendo
            en Cartera hasta que la paguen.
          </p>
        )}

        <form action={action}>
          <input type="hidden" name="evento_id" value={eventoId} />
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Cerrando…" : "Confirmar cierre"}
          </Button>
          {state.error && <p className="text-destructive mt-2 text-xs">{state.error}</p>}
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Reabrir saca la utilidad del dashboard y vuelve a permitir editar.
 *  Quién lo ve lo decide `PUEDE_REABRIR_EVENTO` en src/lib/eventos.ts. */
export function ReabrirEvento({ eventoId }: { eventoId: number }) {
  const [state, action, pending] = useActionState(reabrirEvento, init);
  return (
    <form action={action}>
      <input type="hidden" name="evento_id" value={eventoId} />
      <Button type="submit" size="sm" variant="outline" className="gap-1.5" disabled={pending}>
        <LockOpen className="size-3.5" />
        {pending ? "Reabriendo…" : "Reabrir"}
      </Button>
      {state.error && <p className="text-destructive mt-1 text-xs">{state.error}</p>}
    </form>
  );
}
