"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { EventoState } from "../actions";

/** Botón "quitar" genérico para filas de participantes/profesores de un evento. */
export function RemoveButton({
  action,
  id,
  eventoId,
  label = "Quitar",
}: {
  action: (prev: EventoState, fd: FormData) => Promise<EventoState>;
  id: number;
  eventoId: number;
  label?: string;
}) {
  const [, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="evento_id" value={eventoId} />
      <Button
        type="submit"
        size="sm"
        variant="ghost"
        className="text-destructive hover:text-destructive h-7 px-2 text-xs"
        disabled={pending}
      >
        {pending ? "…" : label}
      </Button>
    </form>
  );
}
