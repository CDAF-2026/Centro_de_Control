"use client";

import { useActionState } from "react";
import { cambiarMiCorreo, type PerfilState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CorreoForm({ actual }: { actual: string }) {
  const [state, action, pending] = useActionState<PerfilState, FormData>(cambiarMiCorreo, {});
  const fe = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-4">
      <div className="text-sm">
        <p className="text-muted-foreground">Correo actual</p>
        {actual ? (
          <p className="break-all font-medium">{actual}</p>
        ) : (
          <p className="text-muted-foreground">
            Todavía no tienes un correo propio registrado. Escribe abajo el tuyo.
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="email">Correo nuevo</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
          {fe.email && <p className="text-destructive text-sm">{fe.email}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password-correo">Tu contraseña actual</Label>
          <Input
            id="password-correo"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          {fe.password && <p className="text-destructive text-sm">{fe.password}</p>}
        </div>
      </div>
      <p className="text-muted-foreground text-xs">
        Pedimos la contraseña para confirmar que eres tú. El cambio aplica de inmediato.
      </p>

      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      {state.ok && <p className="text-muted-foreground text-sm">{state.ok}</p>}
      <Button type="submit" disabled={pending}>{pending ? "Cambiando…" : "Cambiar correo"}</Button>
    </form>
  );
}
