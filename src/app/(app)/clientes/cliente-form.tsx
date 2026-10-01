"use client";

import { useActionState, useState } from "react";
import { createCliente, updateCliente, type ClienteFormState } from "./actions";
import { DocumentoField } from "./documento-field";
import { RH_VALORES } from "./documento";
import { edadDesde } from "@/lib/validations/cliente";
import type { AcudienteRol } from "@/lib/database.types";
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
  tipo_documento: string | null;
  fecha_nacimiento: string | null;
  lugar_nacimiento?: string | null;
  direccion?: string | null;
  celular: string | null;
  email: string | null;
  eps: string | null;
  rh: string | null;
  emergencia_nombre: string | null;
  emergencia_celular: string | null;
  emergencia_parentesco: string | null;
  factura_a_nombre: string | null;
  factura_a_nit: string | null;
  factura_tipo: string | null;
  factura_email: string | null;
  deportes: string[];
};

/** Identidades de facturación que ya existen en Siigo (para el autocompletar). */
export type IdentidadSiigo = { nit: string; nombre: string };

export type AcudienteEditable = {
  nombre: string | null;
  documento: string | null;
  telefono: string | null;
  email?: string | null;
  parentesco: string | null;
  rol?: AcudienteRol | null;
} | null;

/** Etiquetas del rol del acudiente (ficha unificada, 1-oct-2026). */
export const ROL_ACUDIENTE: { valor: AcudienteRol; etiqueta: string }[] = [
  { valor: "padre", etiqueta: "Padre" },
  { valor: "madre", etiqueta: "Madre" },
  { valor: "otro", etiqueta: "Otro acudiente" },
];

function RolSelect({ name, value, onChange }: { name: string; value: AcudienteRol; onChange: (v: AcudienteRol) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>Rol</Label>
      <select
        id={name}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value as AcudienteRol)}
        className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
      >
        {ROL_ACUDIENTE.map((r) => (
          <option key={r.valor} value={r.valor}>{r.etiqueta}</option>
        ))}
      </select>
    </div>
  );
}

function Field({
  label, name, type = "text", error, required, defaultValue, value, readOnly, onChange, list,
}: {
  label: string; name: string; type?: string; error?: string; required?: boolean;
  defaultValue?: string; value?: string; readOnly?: boolean; onChange?: (v: string) => void; list?: string;
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
        list={list}
        className={cn(readOnly && "bg-muted/50 text-muted-foreground cursor-not-allowed")}
        {...(controlado ? { value } : { defaultValue })}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      />
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}

/**
 * Un solo formulario para CREAR y EDITAR la ficha. Eran dos copias y la de crear se quedó sin la
 * casilla de "mismos datos" ni el bloque de facturación: recepción tenía que guardar, volver a
 * entrar a editar y llenarlos ahí (lo reportó el club en video, 23-sep-2026). Sin `cliente` = crear.
 */
export function ClienteForm({
  cliente,
  acudiente = null,
  acudiente2 = null,
  identidadesSiigo = [],
}: {
  cliente?: ClienteEditable;
  /** Acudiente principal (`clientes.acudiente_id`): quien firma y recibe los correos. */
  acudiente?: AcudienteEditable;
  /** Segundo acudiente (el otro padre o madre), opcional. */
  acudiente2?: AcudienteEditable;
  identidadesSiigo?: IdentidadSiigo[];
}) {
  const [state, action, pending] = useActionState(cliente ? updateCliente : createCliente, initial);
  const [fecha, setFecha] = useState(cliente?.fecha_nacimiento ?? "");
  const fe = state.fieldErrors ?? {};
  const edad = edadDesde(fecha);
  const menor = edad != null && edad < 18;

  // Emergencia y acudiente controlados: así la casilla "mismos datos" puede espejar en vivo.
  const [emer, setEmer] = useState({
    nombre: cliente?.emergencia_nombre ?? "",
    celular: cliente?.emergencia_celular ?? "",
    parentesco: cliente?.emergencia_parentesco ?? "",
  });
  const [acu, setAcu] = useState({
    nombre: acudiente?.nombre ?? "",
    documento: acudiente?.documento ?? "",
    telefono: acudiente?.telefono ?? "",
    email: acudiente?.email ?? "",
    parentesco: acudiente?.parentesco ?? "",
    rol: (acudiente?.rol ?? "otro") as AcudienteRol,
  });
  // El segundo acudiente arranca con el rol contrario al principal, que es el caso normal.
  const [acu2, setAcu2] = useState({
    nombre: acudiente2?.nombre ?? "",
    documento: acudiente2?.documento ?? "",
    telefono: acudiente2?.telefono ?? "",
    email: acudiente2?.email ?? "",
    parentesco: acudiente2?.parentesco ?? "",
    rol: (acudiente2?.rol ?? (acudiente?.rol === "madre" ? "padre" : acudiente?.rol === "padre" ? "madre" : "otro")) as AcudienteRol,
  });
  // Arranca marcada si el acudiente guardado ya coincide con la emergencia.
  const yaCoinciden =
    (cliente?.emergencia_nombre ?? "") !== "" &&
    (cliente?.emergencia_nombre ?? "") === (acudiente?.nombre ?? "") &&
    (cliente?.emergencia_celular ?? "") === (acudiente?.telefono ?? "") &&
    (cliente?.emergencia_parentesco ?? "") === (acudiente?.parentesco ?? "");
  const [mismos, setMismos] = useState(yaCoinciden);

  // Facturación: al elegir un nombre conocido de Siigo, se autocompleta su NIT.
  const [fact, setFact] = useState({
    nombre: cliente?.factura_a_nombre ?? "",
    nit: cliente?.factura_a_nit ?? "",
  });
  const elegirNombreFact = (v: string) => {
    const match = identidadesSiigo.find((i) => i.nombre.trim().toLowerCase() === v.trim().toLowerCase());
    setFact((s) => ({ nombre: v, nit: match ? match.nit : s.nit }));
  };

  // El contacto de emergencia se llena primero; el acudiente lo copia. El documento no se copia
  // porque la emergencia no lo tiene: se sigue escribiendo aparte.
  const espejo = mismos && menor;
  const acuNombre = espejo ? emer.nombre : acu.nombre;
  const acuTelefono = espejo ? emer.celular : acu.telefono;
  const acuParentesco = espejo ? emer.parentesco : acu.parentesco;

  return (
    <form action={action} className="space-y-4">
      {cliente && <input type="hidden" name="id" value={cliente.id} />}

      <div className="grid grid-cols-2 gap-4">
        <Field label="Nombres" name="nombres" error={fe.nombres} required defaultValue={cliente?.nombres ?? ""} />
        <Field label="Apellidos" name="apellidos" error={fe.apellidos} required defaultValue={cliente?.apellidos ?? ""} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <DocumentoField
          tipo={cliente?.tipo_documento ?? ""}
          numero={cliente?.documento ?? ""}
          error={fe.documento}
        />
        <Field label="Fecha de nacimiento" name="fechaNacimiento" type="date" error={fe.fechaNacimiento} defaultValue={cliente?.fecha_nacimiento ?? ""} onChange={setFecha} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Lugar de nacimiento" name="lugarNacimiento" error={fe.lugarNacimiento} defaultValue={cliente?.lugar_nacimiento ?? ""} />
        <Field label="Dirección de residencia" name="direccion" error={fe.direccion} defaultValue={cliente?.direccion ?? ""} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Celular" name="celular" error={fe.celular} defaultValue={cliente?.celular ?? ""} />
        <Field label="Correo" name="email" type="email" error={fe.email} defaultValue={cliente?.email ?? ""} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="EPS" name="eps" error={fe.eps} defaultValue={cliente?.eps ?? ""} />
        <div className="space-y-1.5">
          <Label htmlFor="rh">RH (grupo sanguíneo)</Label>
          <select
            id="rh"
            name="rh"
            defaultValue={cliente?.rh ?? ""}
            className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
          >
            <option value="">—</option>
            {RH_VALORES.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      <fieldset className="space-y-3 rounded-lg border p-4">
        <legend className="cdaf-eyebrow px-1">Contacto de emergencia</legend>
        <Field label="Nombre" name="emergenciaNombre" error={fe.emergenciaNombre}
          value={emer.nombre} onChange={(v) => setEmer((s) => ({ ...s, nombre: v }))} />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Celular" name="emergenciaCelular" error={fe.emergenciaCelular}
            value={emer.celular} onChange={(v) => setEmer((s) => ({ ...s, celular: v }))} />
          <Field label="Parentesco" name="emergenciaParentesco" error={fe.emergenciaParentesco}
            value={emer.parentesco} onChange={(v) => setEmer((s) => ({ ...s, parentesco: v }))} />
        </div>
      </fieldset>

      {menor && (
        <fieldset className="border-lime space-y-4 rounded-lg border-l-4 bg-muted/30 p-4">
          <legend className="cdaf-eyebrow px-1">Acudientes (obligatorio · {edad} años)</legend>
          {/* Le dice al servidor que los dos bloques se pintaron: un segundo acudiente vacío = quitarlo. */}
          <input type="hidden" name="acudientesVisibles" value="1" />

          <div className="space-y-3">
            <p className="text-sm font-medium">Acudiente principal <span className="text-muted-foreground font-normal">· firma y recibe los correos</span></p>
            <label className="bg-muted/40 hover:bg-muted/60 flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors">
              <input type="checkbox" checked={mismos} onChange={(e) => setMismos(e.target.checked)} className="accent-lime size-4" />
              Usar los mismos datos del contacto de emergencia
            </label>
            <div className="grid grid-cols-2 gap-4">
              <RolSelect name="acudienteRol" value={acu.rol} onChange={(v) => setAcu((s) => ({ ...s, rol: v }))} />
              <Field label="Nombre del acudiente" name="acudienteNombre" error={fe.acudienteNombre} required
                value={acuNombre} readOnly={espejo} onChange={(v) => setAcu((s) => ({ ...s, nombre: v }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Documento" name="acudienteDocumento"
                value={acu.documento} onChange={(v) => setAcu((s) => ({ ...s, documento: v }))} />
              <Field label="Teléfono" name="acudienteTelefono"
                value={acuTelefono} readOnly={espejo} onChange={(v) => setAcu((s) => ({ ...s, telefono: v }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Correo" name="acudienteEmail" type="email" error={fe.acudienteEmail}
                value={acu.email} onChange={(v) => setAcu((s) => ({ ...s, email: v }))} />
              <Field label="Parentesco" name="acudienteParentesco"
                value={acuParentesco} readOnly={espejo} onChange={(v) => setAcu((s) => ({ ...s, parentesco: v }))} />
            </div>
            {espejo && (
              <p className="text-muted-foreground text-xs">
                Se guardarán el nombre, el teléfono y el parentesco del contacto de emergencia. El documento y el
                correo del acudiente se escriben aparte. Desmarca la casilla para editarlos por separado.
              </p>
            )}
          </div>

          <div className="space-y-3 border-t pt-4">
            <p className="text-sm font-medium">Segundo acudiente <span className="text-muted-foreground font-normal">· opcional (el otro padre o madre)</span></p>
            <div className="grid grid-cols-2 gap-4">
              <RolSelect name="acudiente2Rol" value={acu2.rol} onChange={(v) => setAcu2((s) => ({ ...s, rol: v }))} />
              <Field label="Nombre" name="acudiente2Nombre" error={fe.acudiente2Nombre}
                value={acu2.nombre} onChange={(v) => setAcu2((s) => ({ ...s, nombre: v }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Documento" name="acudiente2Documento"
                value={acu2.documento} onChange={(v) => setAcu2((s) => ({ ...s, documento: v }))} />
              <Field label="Teléfono" name="acudiente2Telefono"
                value={acu2.telefono} onChange={(v) => setAcu2((s) => ({ ...s, telefono: v }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Correo" name="acudiente2Email" type="email" error={fe.acudiente2Email}
                value={acu2.email} onChange={(v) => setAcu2((s) => ({ ...s, email: v }))} />
              <Field label="Parentesco" name="acudiente2Parentesco"
                value={acu2.parentesco} onChange={(v) => setAcu2((s) => ({ ...s, parentesco: v }))} />
            </div>
          </div>
        </fieldset>
      )}

      <fieldset className="space-y-3 rounded-lg border p-4">
        <legend className="cdaf-eyebrow px-1">Facturación</legend>
        <p className="text-muted-foreground text-xs">
          Si sus facturas en Siigo salen a nombre de otra persona o empresa, indícalo aquí: las facturas de ese NIT
          (pasadas y futuras) se sumarán a su historial financiero.
        </p>
        <Field
          label="A nombre de quién se factura"
          name="facturaANombre"
          error={fe.facturaANombre}
          value={fact.nombre}
          onChange={elegirNombreFact}
          list="identidades-siigo"
        />
        <datalist id="identidades-siigo">
          {identidadesSiigo.map((i) => (
            <option key={i.nit} value={i.nombre} />
          ))}
        </datalist>
        <Field
          label="NIT / cédula de facturación"
          name="facturaANit"
          error={fe.facturaANit}
          value={fact.nit}
          onChange={(v) => setFact((s) => ({ ...s, nit: v }))}
        />
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="facturaTipo">Tipo</Label>
            <select
              id="facturaTipo"
              name="facturaTipo"
              defaultValue={cliente?.factura_tipo ?? ""}
              className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
            >
              <option value="">—</option>
              <option value="natural">Persona natural</option>
              <option value="juridica">Persona jurídica</option>
            </select>
          </div>
          <Field label="Correo de facturación" name="facturaEmail" type="email" error={fe.facturaEmail} defaultValue={cliente?.factura_email ?? ""} />
        </div>
      </fieldset>

      <fieldset className="space-y-2 rounded-lg border p-4">
        <legend className="cdaf-eyebrow px-1">Deportes</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="deportes" value="tenis" defaultChecked={cliente?.deportes.includes("tenis")} className="size-4" /> Tenis
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="deportes" value="padel" defaultChecked={cliente?.deportes.includes("padel")} className="size-4" /> Pádel
        </label>
      </fieldset>

      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : cliente ? "Guardar cambios" : "Guardar cliente"}
      </Button>
    </form>
  );
}
