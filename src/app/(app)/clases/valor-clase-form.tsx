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
 * Edita el valor cobrado y el nº de personas de una clase particular.
 *
 * Los dos juntos y no en dos botones porque en el club son la MISMA corrección
 * (pedido de la dueña, 15-sep-2026): "vinieron 2, entonces son $150.000, no
 * $130.000". Separarlos invita a cambiar uno y olvidar el otro. Las personas
 * además deciden el escalón de pago del profesor en la liquidación, así que un
 * 1 donde vinieron 2 le paga de menos.
 *
 * Al guardar, confirma con la cifra nueva y cierra el modal solo: si se quedara
 * abierto mostraría el valor viejo —el modal guarda una copia del evento de
 * cuando se abrió— y parecería que no guardó.
 */
export function ValorClaseForm({
  claseId,
  valor,
  personas,
  editable,
  aviso,
  onGuardado,
}: {
  claseId: number;
  valor: number;
  personas: number;
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
  const personasMostradas = state.personas ?? personas;

  if (guardado) {
    return (
      <div className="border-t pt-3">
        <p className="text-primary flex items-center justify-center gap-2 py-1 text-sm font-medium">
          <Check className="size-4" />
          Guardado · {COP.format(valorMostrado)} · {personasMostradas}{" "}
          {personasMostradas === 1 ? "persona" : "personas"}
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
          <span className="text-muted-foreground text-xs tabular-nums">
            · {personasMostradas} {personasMostradas === 1 ? "persona" : "personas"}
          </span>
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
            <label className="text-muted-foreground text-xs">
              Valor
              <Input
                name="valor"
                defaultValue={String(valor)}
                inputMode="numeric"
                placeholder="Ej: 150000"
                className="max-w-[9rem]"
                autoFocus
              />
            </label>
            <label className="text-muted-foreground text-xs">
              Personas
              <Input
                name="personas"
                defaultValue={String(personas)}
                inputMode="numeric"
                placeholder="1"
                className="max-w-[5rem]"
              />
            </label>
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
