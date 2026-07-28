"use client";

import { useActionState, useEffect, useState } from "react";
import { Send, TriangleAlert } from "lucide-react";
import { crearNota, type NotaState } from "./actions";
import { MencionTextarea } from "./mencion-textarea";
import { Button } from "@/components/ui/button";
import type { StaffMiembro } from "@/lib/database.types";

const inicial: NotaState = {};

/**
 * Composer compacto para dejar una nota ya enganchada a algo (la ficha de un
 * cliente, por ejemplo). Aparece dentro de esa ficha, no en /notas.
 */
export function NotaRapida({
  staff,
  clienteId,
  claseId,
  eventoId,
  placeholder,
}: {
  staff: StaffMiembro[];
  clienteId?: number;
  claseId?: number;
  eventoId?: number;
  placeholder?: string;
}) {
  const [state, action, pending] = useActionState(crearNota, inicial);
  const [urgente, setUrgente] = useState(false);
  const [clave, setClave] = useState(0);

  useEffect(() => {
    if (state.ok) {
      setUrgente(false);
      setClave((k) => k + 1);
    }
  }, [state.ok]);

  return (
    <form action={action} className="space-y-2">
      {clienteId && <input type="hidden" name="cliente_id" value={clienteId} />}
      {claseId && <input type="hidden" name="clase_id" value={claseId} />}
      {eventoId && <input type="hidden" name="evento_id" value={eventoId} />}
      <input type="hidden" name="prioridad" value={urgente ? "alta" : "normal"} />

      <MencionTextarea key={clave} staff={staff} placeholder={placeholder} />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="xs"
          variant={urgente ? "default" : "outline"}
          onClick={() => setUrgente((u) => !u)}
          aria-pressed={urgente}
        >
          <TriangleAlert /> Urgente
        </Button>
        <Button type="submit" size="xs" disabled={pending} className="ml-auto">
          <Send /> {pending ? "Enviando…" : "Dejar la nota"}
        </Button>
      </div>

      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      {state.ok && <p className="text-sm font-medium text-[#46530a]">{state.ok}</p>}
    </form>
  );
}
