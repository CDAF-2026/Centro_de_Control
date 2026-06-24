"use client";

import { useActionState } from "react";
import { inscribirCliente, type AcademiaFormState } from "../actions";
import { ClienteAutocomplete } from "@/components/cliente-autocomplete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: AcademiaFormState = {};
const DIA_LABEL = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export function InscribirForm({ academiaId }: { academiaId: number }) {
  const [state, action, pending] = useActionState(inscribirCliente, initial);
  const dias = [1, 2, 3, 4, 5, 6, 0];

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="academiaId" value={academiaId} />
      <div className="space-y-1.5">
        <Label>Cliente</Label>
        <ClienteAutocomplete name="clienteId" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="plan">Plan</Label>
        <select id="plan" name="plan" className="border-input bg-background h-9 rounded-md border px-3 text-sm">
          <option value="1">1×sem</option>
          <option value="2">2×sem</option>
          <option value="3">3×sem</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="descuento">Desc. %</Label>
        <Input id="descuento" name="descuento" type="number" min={0} max={100} defaultValue={0} className="w-20" />
      </div>
      <div className="space-y-1.5">
        <Label>Días que asiste</Label>
        <div className="flex flex-wrap items-center gap-2 py-1.5">
          {dias.map((d) => (
            <label key={d} className="flex items-center gap-1 text-sm">
              <input type="checkbox" name="dias" value={d} className="accent-primary size-4" />
              {DIA_LABEL[d]}
            </label>
          ))}
        </div>
      </div>
      <Button type="submit" disabled={pending}>Inscribir</Button>
      {state.error && <p className="text-destructive w-full text-sm">{state.error}</p>}
      {state.ok && <p className="text-primary w-full text-sm">{state.ok}</p>}
    </form>
  );
}
