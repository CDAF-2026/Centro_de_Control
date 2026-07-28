"use client";

import { useActionState } from "react";
import { conciliarFactura, marcarMostrador, devolverACola, type PagoState } from "./actions";
import { Button } from "@/components/ui/button";
import { ClienteAutocomplete } from "@/components/cliente-autocomplete";

const init: PagoState = {};
const SELECT = "border-input bg-background h-9 rounded-md border px-2 text-xs";

export function ConciliarForm({
  facturaId,
  eventos,
  sugerido,
}: {
  facturaId: number;
  eventos: { id: number; nombre: string }[];
  /** Evento propuesto por servicio + fecha; queda preseleccionado pero se puede cambiar. */
  sugerido?: { id: number; nombre: string } | null;
}) {
  const [state, action, pending] = useActionState(conciliarFactura, init);
  const [mState, mAction, mPending] = useActionState(marcarMostrador, init);
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="facturaId" value={facturaId} />
          <ClienteAutocomplete name="clienteId" />
          {eventos.length > 0 && (
            <select name="eventoId" defaultValue={sugerido ? String(sugerido.id) : ""} className={SELECT}>
              <option value="">Evento (opcional)…</option>
              {eventos.map((e) => (
                <option key={e.id} value={e.id}>{e.nombre}</option>
              ))}
            </select>
          )}
          <Button type="submit" size="sm" disabled={pending}>Conciliar</Button>
        </form>
        <form action={mAction}>
          <input type="hidden" name="facturaId" value={facturaId} />
          <Button type="submit" size="sm" variant="ghost" disabled={mPending} title="Es venta de mostrador, no tiene cliente">
            Es mostrador
          </Button>
        </form>
      </div>
      {sugerido && (
        <p className="text-muted-foreground text-xs">
          Parece del evento <strong className="text-foreground">{sugerido.nombre}</strong> (coincide el servicio y la
          fecha). Ya viene seleccionado; cámbialo si no es.
        </p>
      )}
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
