"use client";

import { useActionState } from "react";
import { agregarProfesor, type EventoState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const init: EventoState = {};
const SELECT = "border-input bg-background h-9 rounded-md border px-2 text-sm";

export function ProfesorForm({
  eventoId,
  profesores,
}: {
  eventoId: number;
  profesores: { id: string; nombre: string | null }[];
}) {
  const [state, action, pending] = useActionState(agregarProfesor, init);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="evento_id" value={eventoId} />
      <select name="profesor_id" required defaultValue="" className={SELECT}>
        <option value="">Profesor…</option>
        {profesores.map((p) => (
          <option key={p.id} value={p.id}>{p.nombre ?? p.id}</option>
        ))}
      </select>
      <Input name="rol" placeholder="Rol (opcional)" className="h-9 w-36" />
      <Input name="pago" type="number" min={0} placeholder="Pago (COP)" className="h-9 w-32" />
      <Button type="submit" size="sm" disabled={pending}>Agregar</Button>
      {state.error && <span className="text-destructive w-full text-xs">{state.error}</span>}
      {state.ok && <span className="text-primary w-full text-xs">{state.ok}</span>}
    </form>
  );
}
