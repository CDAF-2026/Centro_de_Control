"use client";

import { useActionState } from "react";
import { updateEmpleado, type EmpleadoFormState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: EmpleadoFormState = {};

export type EmpleadoEditable = {
  id: string;
  nombre: string;
  email: string;
  documento: string | null;
  telefono: string | null;
  /** Deportes que dicta. Vacío = sin marcar. */
  deportes: string[];
};

function Field({
  label, name, type = "text", error, required, defaultValue,
}: {
  label: string; name: string; type?: string; error?: string; required?: boolean; defaultValue?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} required={required} defaultValue={defaultValue} />
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}

export function EditarEmpleadoForm({ empleado }: { empleado: EmpleadoEditable }) {
  const [state, action, pending] = useActionState(updateEmpleado, initial);
  const fe = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={empleado.id} />
      <Field label="Nombre" name="nombre" error={fe.nombre} required defaultValue={empleado.nombre} />
      <Field label="Correo electrónico (vacío si no tiene)" name="email" type="email" error={fe.email} defaultValue={empleado.email} />
      <div className="grid grid-cols-2 gap-4">
        <Field label="Documento" name="documento" error={fe.documento} defaultValue={empleado.documento ?? ""} />
        <Field label="Teléfono" name="telefono" error={fe.telefono} defaultValue={empleado.telefono ?? ""} />
      </div>
      {/* Alimenta el selector de profesor del calendario: una clase de pádel
          ofrece profesores de pádel. A quien no tenga nada marcado NO se le
          esconde — sale en un grupo aparte, para que el olvido se vea. */}
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Deportes que dicta</legend>
        <p className="text-muted-foreground text-xs">
          Solo aplica a quien dicta clases. Define en qué canchas se le puede asignar una clase.
        </p>
        <div className="flex gap-4 pt-1">
          {[["tenis", "Tenis"], ["padel", "Pádel"]].map(([valor, etiqueta]) => (
            <label key={valor} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="deportes"
                value={valor}
                defaultChecked={empleado.deportes.includes(valor)}
                className="border-input size-4 rounded border"
              />
              {etiqueta}
            </label>
          ))}
        </div>
      </fieldset>
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar cambios"}</Button>
    </form>
  );
}
