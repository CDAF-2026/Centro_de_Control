"use client";

import { useActionState } from "react";
import { preguntar, type AgenteState } from "./actions";
import { Button } from "@/components/ui/button";

const initial: AgenteState = {};

const SUGERENCIAS = [
  "¿Cuántos clientes activos tenemos?",
  "¿Cuánto se ha conciliado este mes y por qué servicio?",
  "¿Cuántas clases hay realizadas vs canceladas?",
];

export function AgenteChat() {
  const [state, action, pending] = useActionState(preguntar, initial);

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-3">
        <textarea
          name="pregunta"
          required
          rows={3}
          placeholder="Pregunta sobre los datos del club…"
          className="border-input bg-background w-full rounded-md border p-3 text-sm"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Pensando…" : "Preguntar"}
          </Button>
          {SUGERENCIAS.map((s) => (
            <button
              key={s}
              type="submit"
              name="pregunta"
              value={s}
              className="text-muted-foreground hover:text-foreground rounded-full border px-3 py-1 text-xs"
            >
              {s}
            </button>
          ))}
        </div>
      </form>

      {state.question && (
        <div className="space-y-2">
          <p className="text-muted-foreground text-sm">
            <strong>Tú:</strong> {state.question}
          </p>
          {state.answer && (
            <div className="bg-muted/40 rounded-lg border p-4 text-sm whitespace-pre-wrap">
              {state.answer}
            </div>
          )}
        </div>
      )}
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
    </div>
  );
}
