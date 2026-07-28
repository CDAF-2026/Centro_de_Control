"use client";

import { useActionState, useRef } from "react";
import { registrarGasto, type EventoState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const init: EventoState = {};
const SELECT = "border-input bg-background h-9 rounded-md border px-2 text-sm";

/** Etiquetas de las categorías (el valor guardado es la clave de `CATEGORIAS_GASTO`). */
export const CATEGORIA_LABEL: Record<string, string> = {
  refrigerios: "Refrigerios",
  premios: "Premios",
  logistica: "Logística",
  publicidad: "Publicidad",
  arbitraje: "Arbitraje",
  staff_externo: "Staff externo",
  otro: "Otro",
};

export function GastoForm({ eventoId }: { eventoId: number }) {
  const [state, action, pending] = useActionState(registrarGasto, init);
  const formRef = useRef<HTMLFormElement>(null);
  const hoy = new Date();
  const fechaHoy = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        await action(fd);
        formRef.current?.reset();
      }}
      className="space-y-2"
    >
      <input type="hidden" name="evento_id" value={eventoId} />
      <div className="flex flex-wrap items-end gap-2">
        <Input name="concepto" placeholder="Concepto (ej. Premios categoría A)" className="h-9 w-64" required />
        <select name="categoria" defaultValue="refrigerios" className={SELECT} aria-label="Categoría">
          {Object.entries(CATEGORIA_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <Input name="monto" type="number" min={1} placeholder="Monto (COP)" className="h-9 w-36" required />
        <Input name="proveedor" placeholder="Proveedor (opcional)" className="h-9 w-44" />
        <Input name="fecha" type="date" defaultValue={fechaHoy} className="h-9 w-40" aria-label="Fecha del gasto" />
        <Button type="submit" size="sm" disabled={pending}>{pending ? "Guardando…" : "Agregar gasto"}</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-muted-foreground text-xs">
          Soporte (opcional):{" "}
          <input
            type="file"
            name="soporte"
            accept="image/*,application/pdf"
            className="text-foreground file:border-input file:bg-background file:mr-2 file:rounded-md file:border file:px-2 file:py-1 file:text-xs"
          />
        </label>
      </div>
      {state.error && <p className="text-destructive text-xs">{state.error}</p>}
      {state.ok && <p className="text-primary text-xs">{state.ok}</p>}
    </form>
  );
}
