"use client";

import { useActionState } from "react";
import { asignarPago, type PagoState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClienteAutocomplete } from "@/components/cliente-autocomplete";

const initial: PagoState = {};

export function AsignarForm({ pagoId, servicios }: { pagoId: number; servicios: { id: number; nombre: string }[] }) {
  const [state, action, pending] = useActionState(asignarPago, initial);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="pagoId" value={pagoId} />
      <ClienteAutocomplete name="clienteId" />
      <select name="servicio_id" required className="border-input bg-background h-9 w-44 rounded-md border px-2 text-xs">
        <option value="">Servicio…</option>
        {servicios.map((s) => (
          <option key={s.id} value={s.id}>{s.nombre}</option>
        ))}
      </select>
      <Input name="periodos" placeholder="ene, feb…" className="h-9 w-28 text-xs" />
      <Button type="submit" size="sm" disabled={pending}>Asignar</Button>
      {state.error && <span className="text-destructive w-full text-xs">{state.error}</span>}
    </form>
  );
}
