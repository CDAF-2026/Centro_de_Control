"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { editarValorClase, type ValorClaseState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const init: ValorClaseState = {};
/** Cuánto se deja ver la confirmación antes de cerrar el modal. */
const MS_CONFIRMACION = 1600;

/**
 * Edita el valor cobrado de una clase particular. Al guardar, confirma con la cifra
 * nueva y cierra el modal solo: si se quedara abierto mostraría el valor viejo —el
 * modal guarda una copia del evento de cuando se abrió— y parecería que no guardó.
 */
export function ValorClaseForm({
  claseId,
  valor,
  editable,
  aviso,
  onGuardado,
}: {
  claseId: number;
  valor: number;
  editable: boolean;
  aviso: string | null;
  onGuardado?: () => void;
}) {
  const [state, action, pending] = useActionState(editarValorClase, init);
  const [abierto, setAbierto] = useState(false);

  // El callback llega nuevo en cada render del padre; en una ref para que no reinicie
  // el temporizador (si no, el modal podría no cerrarse nunca).
  const cerrarRef = useRef(onGuardado);
  cerrarRef.current = onGuardado;

  // Guardó: se cierra el formulario, se muestra la confirmación y se cierra el modal.
  useEffect(() => {
    if (!state.ok) return;
    setAbierto(false);
    const t = setTimeout(() => cerrarRef.current?.(), MS_CONFIRMACION);
    return () => clearTimeout(t);
  }, [state.ok, state.valor]);

  const guardado = state.ok != null;
  const valorMostrado = state.valor ?? valor;

  if (guardado) {
    return (
      <div className="border-t pt-3">
        <p className="text-primary flex items-center justify-center gap-2 py-1 text-sm font-medium">
          <Check className="size-4" />
          Precio cambiado con éxito · {COP.format(valorMostrado)}
        </p>
      </div>
    );
  }

  return (
    <div className="border-t pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-muted-foreground text-sm">Valor cobrado</span>
        <span className="flex items-center gap-2">
          <span className="font-semibold tabular-nums">{COP.format(valorMostrado)}</span>
          {editable && !abierto && (
            <Button type="button" size="sm" variant="ghost" onClick={() => setAbierto(true)}>
              Editar
            </Button>
          )}
        </span>
      </div>

      {abierto && (
        <form action={action} className="mt-2">
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
              {pending ? "Guardando…" : "Guardar"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAbierto(false)} disabled={pending}>
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {aviso && <p className="text-muted-foreground mt-1.5 text-xs">{aviso}</p>}
      {state.error && <p className="text-destructive mt-1.5 text-xs">{state.error}</p>}
    </div>
  );
}
