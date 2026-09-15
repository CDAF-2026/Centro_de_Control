"use client";

import { useActionState, useEffect, useRef } from "react";
import { Check } from "lucide-react";
import { asignarProfesorClase, type ProfesorClaseState } from "./actions";
import { Button } from "@/components/ui/button";
import type { OpcionProfesor } from "@/lib/staff";

const init: ProfesorClaseState = {};
/** Cuánto se deja ver la confirmación antes de cerrar el modal. */
const MS_CONFIRMACION = 1600;

const SELECT =
  "border-input bg-background h-9 max-w-[11rem] rounded-md border px-2 text-sm";

/**
 * Asigna el profesor a una clase que llegó sin él desde EasyCancha.
 *
 * Va en la fila "Profesor" del modal, donde hoy sale un guión, porque ese es el
 * sitio donde se ve el hueco. Al guardar confirma y cierra el modal solo: el
 * modal guarda una copia del evento de cuando se abrió, así que si se quedara
 * abierto seguiría mostrando el guión y parecería que no guardó — mismo motivo
 * que en `ValorClaseForm`.
 */
export function ProfesorClaseForm({
  claseId,
  opciones,
  deporte,
  onGuardado,
}: {
  claseId: number;
  opciones: OpcionProfesor[];
  deporte: "tenis" | "padel" | null;
  onGuardado?: () => void;
}) {
  const [state, action, pending] = useActionState(asignarProfesorClase, init);

  // El callback llega nuevo en cada render del padre; en una ref para que no
  // reinicie el temporizador (si no, el modal podría no cerrarse nunca).
  const cerrarRef = useRef(onGuardado);
  cerrarRef.current = onGuardado;

  useEffect(() => {
    if (!state.ok) return;
    const t = setTimeout(() => cerrarRef.current?.(), MS_CONFIRMACION);
    return () => clearTimeout(t);
  }, [state.ok, state.profesor]);

  if (state.ok) {
    return (
      <span className="text-primary flex items-center justify-end gap-1.5 text-right font-medium">
        <Check className="size-4 shrink-0" />
        {state.profesor}
      </span>
    );
  }

  const delDeporte = opciones.filter((p) => p.delDeporte);
  const sinMarcar = opciones.filter((p) => !p.delDeporte);
  const etiqueta = deporte === "padel" ? "Profesores de pádel" : deporte === "tenis" ? "Profesores de tenis" : "Profesores";

  if (!opciones.length) {
    return (
      <span className="text-muted-foreground text-right text-xs">
        No hay profesores disponibles.
      </span>
    );
  }

  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="claseId" value={claseId} />
      <span className="flex items-center gap-1.5">
        <select name="profesorId" defaultValue="" className={SELECT} disabled={pending} required>
          <option value="">— Escoge —</option>
          {/* Los del deporte de la clase primero. Los que no tienen deporte
              marcado van aparte pero SÍ salen: esconderlos dejaría a un profesor
              fuera del selector sin que se pueda entender por qué. */}
          {delDeporte.length > 0 && (
            <optgroup label={etiqueta}>
              {delDeporte.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </optgroup>
          )}
          {sinMarcar.length > 0 && (
            <optgroup label="Sin deporte asignado">
              {sinMarcar.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </optgroup>
          )}
        </select>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Guardando…" : "Asignar"}
        </Button>
      </span>
      {state.error && <span className="text-destructive text-right text-xs">{state.error}</span>}
    </form>
  );
}
