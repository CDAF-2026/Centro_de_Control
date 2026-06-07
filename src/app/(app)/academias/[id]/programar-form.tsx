"use client";

import { useActionState } from "react";
import { generarProgramacion, type AcademiaFormState } from "../actions";
import { Button } from "@/components/ui/button";

const initial: AcademiaFormState = {};

export function ProgramarForm({ academiaId }: { academiaId: number }) {
  const [state, action, pending] = useActionState(generarProgramacion, initial);

  return (
    <form action={action}>
      <input type="hidden" name="academiaId" value={academiaId} />
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Generando…" : "Generar / regenerar programación"}
      </Button>
      {state.error && <p className="text-destructive mt-2 text-sm">{state.error}</p>}
      {state.ok && <p className="text-primary mt-2 text-sm">{state.ok}</p>}
    </form>
  );
}
