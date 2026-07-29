"use client";

import { useActionState } from "react";
import { conciliarFactura, marcarMostrador, devolverACola, type PagoState } from "./actions";
import { Button } from "@/components/ui/button";
import { ClienteAutocomplete } from "@/components/cliente-autocomplete";

const init: PagoState = {};

/**
 * Conciliar responde UNA sola pregunta: ¿de quién es esta plata?
 *
 * Atar la factura a un evento se hace desde la ficha del evento, no aquí: esta cola solo
 * lista las `pendiente`, y las facturas de torneo casi siempre llegan como `auto` o
 * `mostrador`, que nunca pasan por aquí. Tener el selector en los dos sitios repartía el
 * trabajo en dos pantallas y hacía creer que con este bastaba (ver migración 0050).
 */
export function ConciliarForm({ facturaId }: { facturaId: number }) {
  const [state, action, pending] = useActionState(conciliarFactura, init);
  const [mState, mAction, mPending] = useActionState(marcarMostrador, init);
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="facturaId" value={facturaId} />
          <ClienteAutocomplete name="clienteId" />
          <Button type="submit" size="sm" disabled={pending}>Conciliar</Button>
        </form>
        <form action={mAction}>
          <input type="hidden" name="facturaId" value={facturaId} />
          <Button type="submit" size="sm" variant="ghost" disabled={mPending} title="Es venta de mostrador, no tiene cliente">
            Es mostrador
          </Button>
        </form>
      </div>
      {state.error && <p className="text-destructive text-xs">{state.error}</p>}
      {state.ok && <p className="text-primary text-xs">{state.ok}</p>}
      {mState.error && <p className="text-destructive text-xs">{mState.error}</p>}
    </div>
  );
}

/** Rescata una factura cerrada (mostrador/conciliada) y la devuelve a la cola de conciliación. */
export function DevolverACola({ facturaId }: { facturaId: number }) {
  const [state, action, pending] = useActionState(devolverACola, init);
  return (
    <div className="space-y-1">
      <form action={action}>
        <input type="hidden" name="facturaId" value={facturaId} />
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          Devolver a la cola
        </Button>
      </form>
      {state.error && <p className="text-destructive text-xs">{state.error}</p>}
      {state.ok && <p className="text-primary text-xs">{state.ok}</p>}
    </div>
  );
}
