"use client";

import { useActionState } from "react";
import {
  cambiarMarcaTurno,
  asignarPinTurno,
  borrarPinTurno,
  type EmpleadoFormState,
} from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

/**
 * "Registro de horas" dentro de la ficha del empleado. Solo superadministrador.
 *
 * Dos cosas distintas y por eso van separadas:
 *   · el INTERRUPTOR decide si la persona marca entrada y salida;
 *   · el PIN es solo para la segunda puerta, el PC de recepción. Sin PIN sigue
 *     marcando desde su celular con total normalidad.
 */
export function TurnosForm({
  empleadoId,
  marcaTurno,
  tienePin,
}: {
  empleadoId: string;
  marcaTurno: boolean;
  tienePin: boolean;
}) {
  const [marcaState, marcaAction, marcaPending] = useActionState<EmpleadoFormState, FormData>(
    cambiarMarcaTurno,
    {},
  );
  const [pinState, pinAction, pinPending] = useActionState<EmpleadoFormState, FormData>(
    asignarPinTurno,
    {},
  );
  const [borrarState, borrarAction, borrarPending] = useActionState<EmpleadoFormState, FormData>(
    borrarPinTurno,
    {},
  );

  return (
    <div className="space-y-6">
      <form action={marcaAction} className="space-y-2">
        <input type="hidden" name="id" value={empleadoId} />
        <input type="hidden" name="marca" value={marcaTurno ? "0" : "1"} />
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium">Registra turnos</span>
          {marcaTurno ? (
            <Badge variant="success">Sí marca</Badge>
          ) : (
            <Badge variant="outline">No marca</Badge>
          )}
          <Button
            type="submit"
            size="sm"
            variant={marcaTurno ? "outline" : "default"}
            disabled={marcaPending}
            className="ml-auto"
          >
            {marcaPending ? "Guardando…" : marcaTurno ? "Quitar" : "Activar"}
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          {marcaTurno
            ? "Le aparece «Mi turno» en el menú y sus horas entran al reporte."
            : "Actívalo solo para quien se paga por horas. No depende del rol: es una condición de su contrato."}
        </p>
        {marcaState.error && <p className="text-destructive text-sm">{marcaState.error}</p>}
        {marcaState.ok && <p className="text-muted-foreground text-sm">{marcaState.ok}</p>}
      </form>

      {marcaTurno && (
        <div className="space-y-2 border-t pt-4">
          <form action={pinAction} className="space-y-2">
            <input type="hidden" name="id" value={empleadoId} />
            <div className="flex flex-wrap items-center gap-3">
              <Label htmlFor="pin">PIN del computador de recepción</Label>
              {tienePin ? (
                <Badge variant="success">Asignado</Badge>
              ) : (
                <Badge variant="outline">Sin PIN</Badge>
              )}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <Input
                id="pin"
                name="pin"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                placeholder="4 dígitos"
                className="w-32 tabular-nums"
              />
              <Button type="submit" size="sm" variant="outline" disabled={pinPending}>
                {pinPending ? "Guardando…" : tienePin ? "Cambiar PIN" : "Asignar PIN"}
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              Solo hace falta para marcar en el computador de recepción; desde su celular
              marca sin PIN. Anótalo y entrégaselo: aquí no se puede volver a ver, se guarda
              cifrado. A los 5 intentos fallidos se bloquea 15 minutos.
            </p>
            {pinState.fieldErrors?.pin && (
              <p className="text-destructive text-sm">{pinState.fieldErrors.pin}</p>
            )}
            {pinState.error && <p className="text-destructive text-sm">{pinState.error}</p>}
            {pinState.ok && <p className="text-muted-foreground text-sm">{pinState.ok}</p>}
          </form>

          {tienePin && (
            <form action={borrarAction}>
              <input type="hidden" name="id" value={empleadoId} />
              <Button type="submit" size="sm" variant="ghost" disabled={borrarPending}>
                {borrarPending ? "Quitando…" : "Quitar el PIN"}
              </Button>
              {borrarState.error && (
                <p className="text-destructive text-sm">{borrarState.error}</p>
              )}
              {borrarState.ok && (
                <p className="text-muted-foreground text-sm">{borrarState.ok}</p>
              )}
            </form>
          )}
        </div>
      )}
    </div>
  );
}
