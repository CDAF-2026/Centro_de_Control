"use client";

import { useActionState } from "react";
import { asignarPago, type PagoState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initial: PagoState = {};

export function AsignarForm({
  pagoId,
  clientes,
}: {
  pagoId: number;
  clientes: { id: number; nombres: string; apellidos: string }[];
}) {
  const [state, action, pending] = useActionState(asignarPago, initial);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="pagoId" value={pagoId} />
      <select name="clienteId" required className="border-input bg-background h-8 rounded-md border px-2 text-xs">
        <option value="">Cliente…</option>
        {clientes.map((c) => (
          <option key={c.id} value={c.id}>{c.apellidos}, {c.nombres}</option>
        ))}
      </select>
      <Input name="servicio" placeholder="Servicio" className="h-8 w-36 text-xs" />
      <Input name="periodos" placeholder="ene, feb…" className="h-8 w-28 text-xs" />
      <Button type="submit" size="sm" disabled={pending}>Asignar</Button>
      {state.error && <span className="text-destructive w-full text-xs">{state.error}</span>}
    </form>
  );
}
