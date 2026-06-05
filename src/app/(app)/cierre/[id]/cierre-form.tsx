"use client";

import { useActionState } from "react";
import { cerrarClase, type CierreState } from "../actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function CierreForm({
  claseId,
  estadoActual,
  deportistas,
  presentes,
}: {
  claseId: number;
  estadoActual: string;
  deportistas: { id: number; nombre: string }[];
  presentes: number[];
}) {
  const [state, action, pending] = useActionState<CierreState, FormData>(cerrarClase, {});
  const presentesSet = new Set(presentes);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="claseId" value={claseId} />

      <div className="space-y-1.5">
        <Label htmlFor="estado">¿La clase se dictó?</Label>
        <select
          id="estado"
          name="estado"
          defaultValue={estadoActual === "programada" ? "realizada" : estadoActual}
          className="border-input bg-background h-11 w-full rounded-md border px-3 text-base"
        >
          <option value="realizada">Sí, se dictó (realizada)</option>
          <option value="cancelada">Cancelada</option>
          <option value="no_show">No-show (no asistió)</option>
        </select>
      </div>

      {deportistas.length > 0 && (
        <div className="space-y-2">
          <Label>Asistencia</Label>
          {deportistas.map((d) => (
            <label key={d.id} className="flex items-center gap-3 rounded-md border p-3">
              <input
                type="checkbox"
                name={`presente_${d.id}`}
                defaultChecked={presentesSet.has(d.id)}
                className="size-5"
              />
              <input type="hidden" name="deportista" value={d.id} />
              <span>{d.nombre}</span>
            </label>
          ))}
        </div>
      )}

      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      {state.ok && <p className="text-primary text-sm">{state.ok}</p>}

      <Button type="submit" className="h-11 w-full text-base" disabled={pending}>
        {pending ? "Guardando…" : "Registrar clase"}
      </Button>
    </form>
  );
}
