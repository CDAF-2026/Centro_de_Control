"use client";

import { useActionState } from "react";
import { guardarDatosPerfil, type PerfilState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DatosForm({ nombre, telefono }: { nombre: string; telefono: string }) {
  const [state, action, pending] = useActionState<PerfilState, FormData>(guardarDatosPerfil, {});
  const fe = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="nombre">Nombre</Label>
          <Input id="nombre" name="nombre" defaultValue={nombre} required />
          {fe.nombre && <p className="text-destructive text-sm">{fe.nombre}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="telefono">Teléfono</Label>
          <Input id="telefono" name="telefono" defaultValue={telefono} />
          {fe.telefono && <p className="text-destructive text-sm">{fe.telefono}</p>}
        </div>
      </div>
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      {state.ok && <p className="text-muted-foreground text-sm">{state.ok}</p>}
      <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar datos"}</Button>
    </form>
  );
}
