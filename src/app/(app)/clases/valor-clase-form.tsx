"use client";

import { useActionState, useState } from "react";
import { editarValorClase } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const init: { error?: string; ok?: string } = {};

/**
 * Corrige el valor cobrado de una clase particular. Arranca cerrado (solo muestra
 * la cifra) para que el modal siga leyéndose como ficha y no como formulario.
 */
export function ValorClaseForm({
  claseId,
  valor,
  editable,
  aviso,
}: {
  claseId: number;
  valor: number;
  editable: boolean;
  aviso: string | null;
}) {
  const [state, action, pending] = useActionState(editarValorClase, init);
  const [abierto, setAbierto] = useState(false);

  return (
    <div className="border-t pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-muted-foreground text-sm">Valor cobrado</span>
        <span className="flex items-center gap-2">
          <span className="font-semibold tabular-nums">{COP.format(valor)}</span>
          {editable && !abierto && (
            <Button type="button" size="sm" variant="ghost" onClick={() => setAbierto(true)}>
              Corregir
            </Button>
          )}
        </span>
      </div>

      {abierto && (
        <form action={action} className="mt-2 space-y-2">
          <input type="hidden" name="claseId" value={claseId} />
          <div className="flex flex-wrap items-center gap-2">
            <Input
              name="valor"
              defaultValue={String(valor)}
              inputMode="numeric"
              placeholder="Ej: 110000"
              className="max-w-[9rem]"
              autoFocus
            />
            <Button type="submit" size="sm" disabled={pending}>
              Guardar
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {aviso && <p className="text-muted-foreground mt-1.5 text-xs">{aviso}</p>}

      {state.error && <p className="text-destructive mt-1.5 text-xs">{state.error}</p>}
      {state.ok && <p className="text-primary mt-1.5 text-xs">{state.ok}</p>}
    </div>
  );
}
