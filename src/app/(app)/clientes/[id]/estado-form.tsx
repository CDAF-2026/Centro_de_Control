"use client";

import { useActionState } from "react";
import { toggleEstado, type ClienteFormState } from "../actions";
import { Button } from "@/components/ui/button";

const initial: ClienteFormState = {};

export function EstadoForm({ id, estado }: { id: number; estado: string }) {
  const [state, action, pending] = useActionState(toggleEstado, initial);

  return (
    <form action={action} className="inline">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="estado" value={estado} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {estado === "activo" ? "Marcar retirado" : "Reactivar"}
      </Button>
      {state.error && <span className="text-destructive ml-2 text-sm">{state.error}</span>}
    </form>
  );
}
