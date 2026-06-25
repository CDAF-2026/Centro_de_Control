"use client";

import { useActionState, useState } from "react";
import { inscribirParticipante, type EventoState } from "../actions";
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
      <Input name="monto" type="number" min={0} placeholder="Monto" className="h-9 w-28" />
      <Button type="submit" size="sm" disabled={pending}>Inscribir</Button>
      {state.error && <span className="text-destructive w-full text-xs">{state.error}</span>}
      {state.ok && <span className="text-primary w-full text-xs">{state.ok}</span>}
    </form>
  );
}
