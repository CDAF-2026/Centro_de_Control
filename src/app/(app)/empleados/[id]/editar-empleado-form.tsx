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
      <Field label="Correo electrónico" name="email" type="email" error={fe.email} required defaultValue={empleado.email} />
      <div className="grid grid-cols-2 gap-4">
        <Field label="Documento" name="documento" error={fe.documento} defaultValue={empleado.documento ?? ""} />
        <Field label="Teléfono" name="telefono" error={fe.telefono} defaultValue={empleado.telefono ?? ""} />
      </div>
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar cambios"}</Button>
    </form>
  );
}
