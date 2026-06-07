"use client";

import { useActionState } from "react";
import { createCatalogo, type PaqueteFormState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: PaqueteFormState = {};

export function CatalogoForm() {
  const [state, action, pending] = useActionState(createCatalogo, initial);
  const fe = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="nombre">Nombre</Label>
        <Input id="nombre" name="nombre" placeholder="Bono 8 clases" required />
        {fe.nombre && <p className="text-destructive text-sm">{fe.nombre}</p>}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="numClases">N.º clases</Label>
          <Input id="numClases" name="numClases" type="number" min={1} required />
          {fe.numClases && <p className="text-destructive text-sm">{fe.numClases}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="precio">Precio (COP)</Label>
          <Input id="precio" name="precio" type="number" min={0} defaultValue={0} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="deporte">Deporte</Label>
          <select id="deporte" name="deporte" className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm">
            <option value="">Ambos</option>
            <option value="tenis">Tenis</option>
            <option value="padel">Pádel</option>
          </select>
        </div>
      </div>
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      {state.ok && <p className="text-primary text-sm">{state.ok}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Agregar paquete"}
      </Button>
    </form>
  );
}
