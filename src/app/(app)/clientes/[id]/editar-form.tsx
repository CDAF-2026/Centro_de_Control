"use client";

import { useActionState, useState } from "react";
import { updateCliente, type ClienteFormState } from "../actions";
import { edadDesde } from "@/lib/validations/cliente";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

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
  deportes: string[];
};

export type AcudienteEditable = {
  nombre: string | null;
  documento: string | null;
  telefono: string | null;
  parentesco: string | null;
} | null;

function Field({
  label, name, type = "text", error, required, defaultValue, value, readOnly, onChange,
}: {
  label: string; name: string; type?: string; error?: string; required?: boolean;
  defaultValue?: string; value?: string; readOnly?: boolean; onChange?: (v: string) => void;
}) {
  const controlado = value !== undefined;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        required={required}
        readOnly={readOnly}
        className={cn(readOnly && "bg-muted/50 text-muted-foreground cursor-not-allowed")}
        {...(controlado ? { value } : { defaultValue })}
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

  // Acudiente y emergencia controlados: así la casilla "mismos datos" puede espejar en vivo.
  const [acu, setAcu] = useState({
    nombre: acudiente?.nombre ?? "",
    documento: acudiente?.documento ?? "",
    telefono: acudiente?.telefono ?? "",
    parentesco: acudiente?.parentesco ?? "",
  });
  const [emer, setEmer] = useState({
    nombre: cliente.emergencia_nombre ?? "",
    celular: cliente.emergencia_celular ?? "",
    parentesco: cliente.emergencia_parentesco ?? "",
  });
  // Arranca marcada si la emergencia guardada ya coincide con el acudiente.
  const yaCoinciden =
    (acudiente?.nombre ?? "") !== "" &&
    (cliente.emergencia_nombre ?? "") === (acudiente?.nombre ?? "") &&
    (cliente.emergencia_celular ?? "") === (acudiente?.telefono ?? "") &&
    (cliente.emergencia_parentesco ?? "") === (acudiente?.parentesco ?? "");
  const [mismos, setMismos] = useState(yaCoinciden);

  // Espejo activo solo mientras sea menor (si pasa a mayor, la emergencia vuelve a ser editable).
  const espejo = mismos && menor;
  const emerNombre = espejo ? acu.nombre : emer.nombre;
  const emerCelular = espejo ? acu.telefono : emer.celular;
  const emerParentesco = espejo ? acu.parentesco : emer.parentesco;

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
        {menor && (
          <label className="bg-muted/40 hover:bg-muted/60 flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors">
            <input type="checkbox" checked={mismos} onChange={(e) => setMismos(e.target.checked)} className="accent-lime size-4" />
            Usar los mismos datos del acudiente
          </label>
        )}
        <Field label="Nombre" name="emergenciaNombre" error={fe.emergenciaNombre}
          value={emerNombre} readOnly={espejo} onChange={(v) => setEmer((s) => ({ ...s, nombre: v }))} />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Celular" name="emergenciaCelular" error={fe.emergenciaCelular}
            value={emerCelular} readOnly={espejo} onChange={(v) => setEmer((s) => ({ ...s, celular: v }))} />
          <Field label="Parentesco" name="emergenciaParentesco" error={fe.emergenciaParentesco}
            value={emerParentesco} readOnly={espejo} onChange={(v) => setEmer((s) => ({ ...s, parentesco: v }))} />
        </div>
        {espejo && (
          <p className="text-muted-foreground text-xs">Se guardarán los mismos datos del acudiente. Desmarca la casilla para editarlos aparte.</p>
        )}
      </fieldset>

      <fieldset className="space-y-2 rounded-lg border p-4">
        <legend className="cdaf-eyebrow px-1">Deportes</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="deportes" value="tenis" defaultChecked={cliente.deportes.includes("tenis")} className="size-4" /> Tenis
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="deportes" value="padel" defaultChecked={cliente.deportes.includes("padel")} className="size-4" /> Pádel
        </label>
      </fieldset>

      {menor && (
        <fieldset className="border-lime space-y-4 rounded-lg border-l-4 bg-muted/30 p-4">
          <legend className="cdaf-eyebrow px-1">Acudiente (obligatorio · {edad} años)</legend>
          <Field label="Nombre del acudiente" name="acudienteNombre" error={fe.acudienteNombre} required
            value={acu.nombre} onChange={(v) => setAcu((s) => ({ ...s, nombre: v }))} />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Documento" name="acudienteDocumento"
              value={acu.documento} onChange={(v) => setAcu((s) => ({ ...s, documento: v }))} />
            <Field label="Teléfono" name="acudienteTelefono"
              value={acu.telefono} onChange={(v) => setAcu((s) => ({ ...s, telefono: v }))} />
          </div>
          <Field label="Parentesco" name="acudienteParentesco"
            value={acu.parentesco} onChange={(v) => setAcu((s) => ({ ...s, parentesco: v }))} />
        </fieldset>
      )}

      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar cambios"}</Button>
    </form>
  );
}
