"use client";

import { useActionState, useState } from "react";
import { updateCliente, type ClienteFormState } from "../actions";
import { edadDesde } from "@/lib/validations/cliente";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: ClienteFormState = {};

export type ClienteEditable = {
  id: number;
  nombres: string;
  apellidos: string;
  documento: string | null;
  fecha_nacimiento: string | null;
  celular: string | null;
  email: string | null;
  emergencia_nombre: string | null;
  emergencia_celular: string | null;
  emergencia_parentesco: string | null;
};

export type AcudienteEditable = {
  nombre: string | null;
  documento: string | null;
  telefono: string | null;
  parentesco: string | null;
} | null;

function Field({
  label, name, type = "text", error, required, defaultValue, onChange,
}: {
  label: string; name: string; type?: string; error?: string; required?: boolean;
  defaultValue?: string; onChange?: (v: string) => void;
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

export function EditarClienteForm({ cliente, acudiente }: { cliente: ClienteEditable; acudiente: AcudienteEditable }) {
  const [state, action, pending] = useActionState(updateCliente, initial);
  const [fecha, setFecha] = useState(cliente.fecha_nacimiento ?? "");
  const fe = state.fieldErrors ?? {};
  const edad = edadDesde(fecha);
  const menor = edad != null && edad < 18;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={cliente.id} />

      <div className="grid grid-cols-2 gap-4">
        <Field label="Nombres" name="nombres" error={fe.nombres} required defaultValue={cliente.nombres} />
        <Field label="Apellidos" name="apellidos" error={fe.apellidos} required defaultValue={cliente.apellidos} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Documento / Cédula" name="documento" error={fe.documento} defaultValue={cliente.documento ?? ""} />
        <Field label="Fecha de nacimiento" name="fechaNacimiento" type="date" error={fe.fechaNacimiento} defaultValue={cliente.fecha_nacimiento ?? ""} onChange={setFecha} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Celular" name="celular" error={fe.celular} defaultValue={cliente.celular ?? ""} />
        <Field label="Correo" name="email" type="email" error={fe.email} defaultValue={cliente.email ?? ""} />
      </div>

      <fieldset className="space-y-3 rounded-lg border p-4">
        <legend className="cdaf-eyebrow px-1">Contacto de emergencia</legend>
        <Field label="Nombre" name="emergenciaNombre" error={fe.emergenciaNombre} defaultValue={cliente.emergencia_nombre ?? ""} />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Celular" name="emergenciaCelular" error={fe.emergenciaCelular} defaultValue={cliente.emergencia_celular ?? ""} />
          <Field label="Parentesco" name="emergenciaParentesco" error={fe.emergenciaParentesco} defaultValue={cliente.emergencia_parentesco ?? ""} />
        </div>
      </fieldset>

      {menor && (
        <fieldset className="border-lime space-y-4 rounded-lg border-l-4 bg-muted/30 p-4">
          <legend className="cdaf-eyebrow px-1">Acudiente (obligatorio · {edad} años)</legend>
          <Field label="Nombre del acudiente" name="acudienteNombre" error={fe.acudienteNombre} required defaultValue={acudiente?.nombre ?? ""} />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Documento" name="acudienteDocumento" defaultValue={acudiente?.documento ?? ""} />
            <Field label="Teléfono" name="acudienteTelefono" defaultValue={acudiente?.telefono ?? ""} />
          </div>
          <Field label="Parentesco" name="acudienteParentesco" defaultValue={acudiente?.parentesco ?? ""} />
        </fieldset>
      )}

      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar cambios"}</Button>
    </form>
  );
}
