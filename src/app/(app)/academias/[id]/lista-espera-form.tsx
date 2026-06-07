"use client";

import { useActionState } from "react";
import { addListaEspera, type AcademiaFormState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: AcademiaFormState = {};

export function ListaEsperaForm({ academiaId }: { academiaId: number }) {
  const [state, action, pending] = useActionState(addListaEspera, initial);

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="academiaId" value={academiaId} />
      <div className="space-y-1.5">
        <Label htmlFor="le-nombre">Nombre</Label>
        <Input id="le-nombre" name="nombre" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="le-contacto">Contacto</Label>
        <Input id="le-contacto" name="contacto" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="le-nivel">Nivel</Label>
        <Input id="le-nivel" name="nivel" className="w-28" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="le-edad">Edad</Label>
        <Input id="le-edad" name="edad" type="number" min={0} className="w-20" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="le-disp">Disponibilidad</Label>
        <Input id="le-disp" name="disponibilidad" />
      </div>
      <Button type="submit" variant="outline" disabled={pending}>
        Agregar
      </Button>
      {state.error && <p className="text-destructive w-full text-sm">{state.error}</p>}
      {state.ok && <p className="text-primary w-full text-sm">{state.ok}</p>}
    </form>
  );
}
