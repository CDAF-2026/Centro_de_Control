"use client";

import { useActionState } from "react";
import { importarClientesCsv, type ImportState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: ImportState = {};

export function ImportForm() {
  const [state, action, pending] = useActionState(importarClientesCsv, initial);

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="archivo">Archivo CSV</Label>
        <Input id="archivo" name="archivo" type="file" accept=".csv,text/csv" required />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Importando…" : "Importar clientes"}
      </Button>

      {state.error && <p className="text-destructive text-sm">{state.error}</p>}

      {state.done && (
        <div className="space-y-2 rounded-lg border p-4 text-sm">
          <p className="text-primary font-medium">
            ✅ {state.creados} de {state.total} clientes creados.
          </p>
          {state.errores && state.errores.length > 0 && (
            <div className="space-y-1">
              <p className="text-destructive">{state.errores.length} fila(s) con error:</p>
              <ul className="text-muted-foreground list-disc pl-5">
                {state.errores.slice(0, 20).map((e, i) => (
                  <li key={i}>
                    Fila {e.fila}: {e.motivo}
                  </li>
                ))}
              </ul>
              {state.errores.length > 20 && (
                <p className="text-muted-foreground">…y {state.errores.length - 20} más.</p>
              )}
            </div>
          )}
        </div>
      )}
    </form>
  );
}
