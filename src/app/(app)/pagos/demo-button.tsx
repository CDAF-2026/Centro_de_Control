"use client";

import { useActionState } from "react";
import { importarDemo, type PagoState } from "./actions";
import { Button } from "@/components/ui/button";

export function DemoButton() {
  const [state, action, pending] = useActionState<PagoState, FormData>(importarDemo, {});
  return (
    <form action={action} className="flex items-center gap-2">
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Importando…" : "Importar pagos demo"}
      </Button>
      {state.ok && <span className="text-primary text-sm">{state.ok}</span>}
      {state.error && <span className="text-destructive text-sm">{state.error}</span>}
    </form>
  );
}
