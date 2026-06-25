"use client";

import { useActionState } from "react";
import { createServicio, type ServicioState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const init: ServicioState = {};
const SELECT = "border-input bg-background h-9 rounded-md border px-2 text-sm";

export function ServicioForm() {
  const [state, action, pending] = useActionState(createServicio, init);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="nombre">Nombre</Label>
        <Input id="nombre" name="nombre" required className="w-48" placeholder="Masterclass, Patrocinio…" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="categoria_saldo">¿Genera saldo?</Label>
        <select id="categoria_saldo" name="categoria_saldo" defaultValue="" className={SELECT}>
          <option value="">Informativo</option>
          <option value="academia">Academia</option>
          <option value="paquete">Paquete</option>
          <option value="particular">Clase particular</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="color">Color</Label>
        <input id="color" type="color" name="color" defaultValue="#8aa0a8" className="h-9 w-12 rounded-md border" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="orden">Orden</Label>
        <Input id="orden" name="orden" type="number" defaultValue={100} className="w-20" />
      </div>
      <Button type="submit" disabled={pending}>Agregar servicio</Button>
      {state.ok && <span className="text-primary w-full text-sm">{state.ok}</span>}
      {state.error && <span className="text-destructive w-full text-sm">{state.error}</span>}
    </form>
  );
}
