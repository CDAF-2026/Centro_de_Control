"use client";

import { useActionState } from "react";
import { cambiarMiPassword, type PerfilState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PasswordForm() {
  const [state, action, pending] = useActionState<PerfilState, FormData>(cambiarMiPassword, {});
  const fe = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="actual">Contraseña actual</Label>
        <Input id="actual" name="actual" type="password" autoComplete="current-password" required />
        {fe.actual && <p className="text-destructive text-sm">{fe.actual}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="nueva">Contraseña nueva</Label>
          <Input id="nueva" name="nueva" type="password" autoComplete="new-password" required />
          {fe.nueva && <p className="text-destructive text-sm">{fe.nueva}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="repetir">Repítela</Label>
          <Input id="repetir" name="repetir" type="password" autoComplete="new-password" required />
          {fe.repetir && <p className="text-destructive text-sm">{fe.repetir}</p>}
        </div>
      </div>
      <p className="text-muted-foreground text-xs">Mínimo 8 caracteres.</p>

      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      {state.ok && <p className="text-muted-foreground text-sm">{state.ok}</p>}
      <Button type="submit" disabled={pending}>{pending ? "Cambiando…" : "Cambiar contraseña"}</Button>
    </form>
  );
}
