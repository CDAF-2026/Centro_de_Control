"use client";

import { useActionState, useState } from "react";
import { createEmpleado, type EmpleadoFormState } from "../actions";
import { ROLE_OPTIONS } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: EmpleadoFormState = {};

function Field({
  label,
  name,
  type = "text",
  error,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  error?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} required={required} />
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}

export function EmpleadoForm() {
  const [state, action, pending] = useActionState(createEmpleado, initial);
  const [role, setRole] = useState("recepcion");
  const fe = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-4">
      <Field label="Nombre" name="nombre" error={fe.nombre} required />
      <Field label="Correo" name="email" type="email" error={fe.email} required />
      <Field label="Contraseña inicial" name="password" type="password" error={fe.password} required />
      <div className="grid grid-cols-2 gap-4">
        <Field label="Documento" name="documento" error={fe.documento} />
        <Field label="Teléfono" name="telefono" error={fe.telefono} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="role">Rol</Label>
        <select
          id="role"
          name="role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
        >
          {ROLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {role === "profesor" && (
        <Field label="Valor por hora (COP)" name="valorClase" type="number" error={fe.valorClase} required />
      )}
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Creando…" : "Crear empleado"}
      </Button>
    </form>
  );
}
