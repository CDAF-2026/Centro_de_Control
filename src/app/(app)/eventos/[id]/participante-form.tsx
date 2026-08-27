"use client";

import { useActionState, useState } from "react";
import { inscribirParticipante, cambiarPagoParticipante, type EventoState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClienteAutocomplete } from "@/components/cliente-autocomplete";

const init: EventoState = {};

export function ParticipanteForm({ eventoId }: { eventoId: number }) {
  const [state, action, pending] = useActionState(inscribirParticipante, init);
  const [externo, setExterno] = useState(false);

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="evento_id" value={eventoId} />
      <div className="flex items-center gap-3 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="radio" name="_tipo" checked={!externo} onChange={() => setExterno(false)} /> Cliente
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" name="_tipo" checked={externo} onChange={() => setExterno(true)} /> Externo
        </label>
      </div>
      {externo ? (
        <>
          <Input name="nombre_externo" placeholder="Nombre" className="h-9 w-40" />
          <Input name="telefono_externo" placeholder="Teléfono" className="h-9 w-32" />
        </>
      ) : (
        <ClienteAutocomplete name="clienteId" />
      )}
      <Input name="monto" type="number" min={0} placeholder="Valor inscripción" className="h-9 w-36" />
      {/* Arranca SIN marcar: inscribirse no es haber pagado. Antes el "pagado" salía de que
          el monto fuera mayor a cero, así que teclear el valor ya lo daba por cobrado. */}
      <label className="flex h-9 items-center gap-1.5 text-sm">
        <input type="checkbox" name="pagado" className="accent-primary size-3.5" />
        Ya pagó
      </label>
      <Button type="submit" size="sm" disabled={pending}>Inscribir</Button>
      {state.error && <span className="text-destructive w-full text-xs">{state.error}</span>}
      {state.ok && <span className="text-primary w-full text-xs">{state.ok}</span>}
    </form>
  );
}

/**
 * Interruptor de pago de un participante ya inscrito.
 * Va aparte de `RemoveButton` a propósito: aquel pinta en rojo de "quitar", y esto no
 * destruye nada — solo dice si la persona ya entregó la plata.
 */
export function PagoParticipante({
  id,
  eventoId,
  pagado,
}: {
  id: number;
  eventoId: number;
  pagado: boolean;
}) {
  const [state, action, pending] = useActionState(cambiarPagoParticipante, init);
  return (
    <form action={action} className="inline-flex">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="evento_id" value={eventoId} />
      <Button
        type="submit"
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs"
        disabled={pending}
        title={pagado ? "Marcar como pendiente de pago" : "Marcar como pagado"}
      >
        {pending ? "…" : pagado ? "Marcar pendiente" : "Marcar pagado"}
      </Button>
      {state.error && <span className="text-destructive ml-2 self-center text-xs">{state.error}</span>}
    </form>
  );
}
