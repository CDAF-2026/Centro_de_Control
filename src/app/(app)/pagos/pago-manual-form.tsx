"use client";

import { useActionState } from "react";
import { addPago, type PagoState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: PagoState = {};

export function PagoManualForm() {
  const [state, action, pending] = useActionState(addPago, initial);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="monto">Monto (COP)</Label>
        <Input id="monto" name="monto" type="number" min={0} required className="w-32" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="fecha">Fecha</Label>
        <Input id="fecha" name="fecha" type="date" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="centro_costos">Centro de costos</Label>
        <select id="centro_costos" name="centro_costos" className="border-input bg-background h-9 rounded-md border px-3 text-sm">
          <option value="clase_particular">Clase particular</option>
          <option value="academia_tenis">Academia tenis</option>
          <option value="academia_padel">Academia pádel</option>
          <option value="cafeteria">Cafetería</option>
          <option value="otro">Otro</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="concepto">Concepto</Label>
        <Input id="concepto" name="concepto" className="w-44" />
      </div>
      <Button type="submit" disabled={pending}>Agregar</Button>
      {state.ok && <span className="text-primary w-full text-sm">{state.ok}</span>}
      {state.error && <span className="text-destructive w-full text-sm">{state.error}</span>}
    </form>
  );
}
