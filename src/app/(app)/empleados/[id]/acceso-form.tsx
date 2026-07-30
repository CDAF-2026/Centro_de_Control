"use client";

import { useActionState } from "react";
import {
  cambiarRolEmpleado,
  cambiarAccesoEmpleado,
  asignarPasswordEmpleado,
  type EmpleadoFormState,
} from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ROLE_OPTIONS } from "@/lib/roles";
import type { AppRole } from "@/lib/database.types";

export function AccesoForm({
  empleadoId,
  role,
  activo,
  tieneCorreo,
  esUnoMismo,
}: {
  empleadoId: string;
  role: AppRole;
  activo: boolean;
  tieneCorreo: boolean;
  esUnoMismo: boolean;
}) {
  const [rolState, rolAction, rolPending] = useActionState<EmpleadoFormState, FormData>(
    cambiarRolEmpleado,
    {},
  );
  const [accState, accAction, accPending] = useActionState<EmpleadoFormState, FormData>(
    cambiarAccesoEmpleado,
    {},
  );
  const [pwdState, pwdAction, pwdPending] = useActionState<EmpleadoFormState, FormData>(
    asignarPasswordEmpleado,
    {},
  );

  return (
    <div className="space-y-6">
      {/* Estado de la cuenta */}
      <form action={accAction} className="space-y-2">
        <input type="hidden" name="id" value={empleadoId} />
        <input type="hidden" name="activo" value={activo ? "0" : "1"} />
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium">Estado</span>
          {activo ? (
            <Badge variant="success">Puede entrar</Badge>
          ) : (
            <Badge variant="destructive">Sin acceso</Badge>
          )}
          {!esUnoMismo && (
            <Button
              type="submit"
              size="sm"
              variant={activo ? "outline" : "default"}
              disabled={accPending}
              className="ml-auto"
            >
              {accPending ? "Guardando…" : activo ? "Quitar acceso" : "Dar acceso"}
            </Button>
          )}
        </div>
        <p className="text-muted-foreground text-xs">
          {activo
            ? "Quitar el acceso cierra su sesión y le impide volver a entrar. Sus clases y liquidaciones quedan intactas."
            : "Esta persona no puede entrar. Sigue apareciendo en el historial de clases y liquidaciones."}
        </p>
        {esUnoMismo && (
          <p className="text-muted-foreground text-xs">
            Es tu propia cuenta: no puedes quitarte el acceso ni cambiarte el rol.
          </p>
        )}
        {accState.error && <p className="text-destructive text-sm">{accState.error}</p>}
        {accState.ok && <p className="text-muted-foreground text-sm">{accState.ok}</p>}
      </form>

      {/* Rol */}
      <form action={rolAction} className="space-y-2 border-t pt-4">
        <input type="hidden" name="id" value={empleadoId} />
        <Label htmlFor="role">Rol</Label>
        <div className="flex flex-wrap items-end gap-3">
          <select
            id="role"
            name="role"
            defaultValue={role}
            disabled={esUnoMismo}
            className="border-input bg-background h-9 min-w-48 rounded-md border px-3 text-sm disabled:opacity-50"
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          {!esUnoMismo && (
            <Button type="submit" size="sm" variant="outline" disabled={rolPending}>
              {rolPending ? "Guardando…" : "Cambiar rol"}
            </Button>
          )}
        </div>
        <p className="text-muted-foreground text-xs">
          Decide qué módulos ve al entrar.
        </p>
        {rolState.error && <p className="text-destructive text-sm">{rolState.error}</p>}
        {rolState.ok && <p className="text-muted-foreground text-sm">{rolState.ok}</p>}
      </form>

      {/* Contraseña */}
      <form action={pwdAction} className="space-y-2 border-t pt-4">
        <input type="hidden" name="id" value={empleadoId} />
        <Label htmlFor="password">Asignar contraseña nueva</Label>
        <div className="flex flex-wrap items-end gap-3">
          <Input
            id="password"
            name="password"
            type="text"
            autoComplete="off"
            placeholder="Mínimo 8 caracteres"
            className="min-w-56 flex-1"
          />
          <Button type="submit" size="sm" variant="outline" disabled={pwdPending}>
            {pwdPending ? "Guardando…" : "Asignar"}
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          {tieneCorreo
            ? "Se la entregas a la persona y ella la cambia desde Mi perfil."
            : "Ojo: esta persona todavía no tiene un correo propio registrado, y el correo es lo que se escribe para entrar. Ponle el suyo con «Editar» antes de darle la clave."}
        </p>
        {pwdState.fieldErrors?.password && (
          <p className="text-destructive text-sm">{pwdState.fieldErrors.password}</p>
        )}
        {pwdState.error && <p className="text-destructive text-sm">{pwdState.error}</p>}
        {pwdState.ok && <p className="text-muted-foreground text-sm">{pwdState.ok}</p>}
      </form>
    </div>
  );
}
