"use client";

import { useActionState } from "react";
import { asignarPago, type PagoState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initial: PagoState = {};

const SERVICIOS = [
  "Academia Tenis",
  "Academia Padel",
  "Paquete de clases Padel",
  "Paquete de clases Tenis",
  "Cafetería",
  "Alquiler Raqueta",
  "Alquiler Padel",
  "Torneo",
];

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
      <select name="servicio" required className="border-input bg-background h-8 w-44 rounded-md border px-2 text-xs">
        <option value="">Servicio…</option>
        {SERVICIOS.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      <Input name="periodos" placeholder="ene, feb…" className="h-8 w-28 text-xs" />
      <Button type="submit" size="sm" disabled={pending}>Asignar</Button>
      {state.error && <span className="text-destructive w-full text-xs">{state.error}</span>}
    </form>
  );
}
