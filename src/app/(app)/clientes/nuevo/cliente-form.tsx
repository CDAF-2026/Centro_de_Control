"use client";

import { useActionState, useState } from "react";
import { createCliente, type ClienteFormState } from "../actions";
import { edadDesde } from "@/lib/validations/cliente";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: ClienteFormState = {};

function Field({
  label,
  name,
  type = "text",
  error,
  required,
  defaultValue,
  onChange,
}: {
  label: string;
  name: string;
  type?: string;
  error?: string;
  required?: boolean;
  defaultValue?: string;
  onChange?: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      />
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}

export function ClienteForm() {
  const [state, action, pending] = useActionState(createCliente, initial);
  const [fecha, setFecha] = useState("");
  const fe = state.fieldErrors ?? {};
  const edad = edadDesde(fecha);
  const menor = edad != null && edad < 18;

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Nombres" name="nombres" error={fe.nombres} required />
        <Field label="Apellidos" name="apellidos" error={fe.apellidos} required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Documento" name="documento" error={fe.documento} />
        <Field
          label="Fecha de nacimiento"
          name="fechaNacimiento"
          type="date"
          error={fe.fechaNacimiento}
          onChange={setFecha}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Celular" name="celular" error={fe.celular} />
        <Field label="Correo" name="email" type="email" error={fe.email} />
      </div>
      <Field label="Contacto de emergencia" name="contactoEmergencia" error={fe.contactoEmergencia} />

      {menor && (
        <fieldset className="border-lime space-y-4 rounded-lg border-l-4 bg-muted/30 p-4">
          <legend className="cdaf-eyebrow px-1">
            Acudiente (obligatorio · {edad} años)
          </legend>
          <Field label="Nombre del acudiente" name="acudienteNombre" error={fe.acudienteNombre} required />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Documento" name="acudienteDocumento" />
            <Field label="Teléfono" name="acudienteTelefono" />
          </div>
          <Field label="Parentesco" name="acudienteParentesco" />
        </fieldset>
      )}

      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Guardar cliente"}
      </Button>
    </form>
  );
}
