"use client";

import { useActionState } from "react";
import { updateValorClase, type EmpleadoFormState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: EmpleadoFormState = {};

export function ValorClaseForm({ profesorId }: { profesorId: string }) {
  const [state, action, pending] = useActionState(updateValorClase, initial);

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="profesorId" value={profesorId} />
      <div className="space-y-1.5">
        <Label htmlFor="valor">Nuevo valor por hora (COP)</Label>
        <Input id="valor" name="valor" type="number" min={0} required className="w-48" />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Actualizar valor"}
      </Button>
      {state.error && <p className="text-destructive w-full text-sm">{state.error}</p>}
    </form>
  );
}
