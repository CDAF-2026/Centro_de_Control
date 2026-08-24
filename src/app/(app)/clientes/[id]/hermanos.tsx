"use client";

import { useActionState, useState } from "react";
import { agregarHermano, editarHermano, quitarHermano, type ClienteFormState } from "../actions";
import { DocumentoField } from "../documento-field";
import { RH_VALORES } from "../documento";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Pencil, Plus, X } from "lucide-react";

const initial: ClienteFormState = {};

export type Miembro = {
  id: number;
  nombres: string;
  apellidos: string;
  fecha_nacimiento: string | null;
  documento: string | null;
  tipo_documento: string | null;
  eps: string | null;
  rh: string | null;
  deportes: string[];
  es_titular: boolean;
};

function edad(fn: string | null): number | null {
  if (!fn) return null;
  const d = new Date(`${fn}T00:00:00`);
  const h = new Date();
  let e = h.getFullYear() - d.getFullYear();
  if (h.getMonth() < d.getMonth() || (h.getMonth() === d.getMonth() && h.getDate() < d.getDate())) e--;
  return e;
}
const depLabel = (d: string) => (d === "tenis" ? "Tenis" : "Pádel");

/** Formulario de hermano: sirve para crear (sin `miembro`) y para editar (con él). */
function FormHermano({
  clienteId,
  miembro,
  state,
  action,
  pending,
  onCancel,
}: {
  clienteId: number;
  miembro?: Miembro;
  state: ClienteFormState;
  action: (formData: FormData) => void;
  pending: boolean;
  onCancel: () => void;
}) {
  const fe = state.fieldErrors ?? {};
  const uid = miembro ? `h${miembro.id}` : "h";

  return (
    <form action={action} className="bg-muted/30 space-y-3 rounded-lg border p-4">
      <input type="hidden" name="clienteId" value={clienteId} />
      {miembro && <input type="hidden" name="miembroId" value={miembro.id} />}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-nombres`}>Nombres</Label>
          <Input id={`${uid}-nombres`} name="nombres" defaultValue={miembro?.nombres ?? ""} required />
          {fe.nombres && <p className="text-destructive text-xs">{fe.nombres}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-apellidos`}>Apellidos</Label>
          <Input id={`${uid}-apellidos`} name="apellidos" defaultValue={miembro?.apellidos ?? ""} required />
          {fe.apellidos && <p className="text-destructive text-xs">{fe.apellidos}</p>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-fecha`}>Fecha de nacimiento</Label>
          <Input
            id={`${uid}-fecha`}
            name="fechaNacimiento"
            type="date"
            defaultValue={miembro?.fecha_nacimiento ?? ""}
          />
        </div>
        <DocumentoField tipo={miembro?.tipo_documento ?? ""} numero={miembro?.documento ?? ""} error={fe.documento} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-eps`}>EPS</Label>
          <Input id={`${uid}-eps`} name="eps" defaultValue={miembro?.eps ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-rh`}>RH</Label>
          <select
            id={`${uid}-rh`}
            name="rh"
            defaultValue={miembro?.rh ?? ""}
            className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
          >
            <option value="">—</option>
            {RH_VALORES.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="deportes"
            value="tenis"
            className="size-4"
            defaultChecked={miembro?.deportes.includes("tenis")}
          />{" "}
          Tenis
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="deportes"
            value="padel"
            className="size-4"
            defaultChecked={miembro?.deportes.includes("padel")}
          />{" "}
          Pádel
        </label>
      </div>
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Guardando…" : miembro ? "Guardar cambios" : "Guardar hermano"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

export function Hermanos({
  clienteId,
  miembros,
  puedeEditar,
}: {
  clienteId: number;
  miembros: Miembro[];
  puedeEditar: boolean;
}) {
  // Un solo formulario abierto a la vez: "nuevo" o el id del hermano en edición.
  const [modo, setModo] = useState<number | "nuevo" | null>(null);

  const [stateAdd, accionAdd, pendingAdd] = useActionState(
    async (prev: ClienteFormState, fd: FormData) => {
      const r = await agregarHermano(prev, fd);
      if (r.ok) setModo(null);
      return r;
    },
    initial,
  );
  // A qué hermano pertenece `stateEdit`, para no arrastrarle el error a otro.
  const [editId, setEditId] = useState<number | null>(null);
  const [stateEdit, accionEdit, pendingEdit] = useActionState(
    async (prev: ClienteFormState, fd: FormData) => {
      setEditId(Number(fd.get("miembroId")));
      const r = await editarHermano(prev, fd);
      if (r.ok) setModo(null);
      return r;
    },
    initial,
  );

  return (
    <div className="space-y-3">
      <ul className="divide-y">
        {miembros.map((m) => {
          if (modo === m.id) {
            return (
              <li key={m.id} className="py-2">
                <FormHermano
                  clienteId={clienteId}
                  miembro={m}
                  state={editId === m.id ? stateEdit : initial}
                  action={accionEdit}
                  pending={pendingEdit}
                  onCancel={() => setModo(null)}
                />
              </li>
            );
          }
          const e = edad(m.fecha_nacimiento);
          return (
            <li key={m.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-medium">
                  {m.nombres} {m.apellidos}
                  {m.es_titular && <Badge variant="secondary">Titular</Badge>}
                </p>
                <p className="text-muted-foreground text-xs">
                  {e != null ? `${e} años` : "Sin fecha de nacimiento"}
                  {m.deportes.length > 0 && ` · ${m.deportes.map(depLabel).join(" · ")}`}
                </p>
              </div>
              {puedeEditar && !m.es_titular && (
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    title="Editar hermano"
                    onClick={() => setModo(m.id)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <form action={quitarHermano}>
                    <input type="hidden" name="miembroId" value={m.id} />
                    <input type="hidden" name="clienteId" value={clienteId} />
                    <Button type="submit" variant="ghost" size="icon-sm" title="Quitar hermano">
                      <X className="size-4" />
                    </Button>
                  </form>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {puedeEditar &&
        (modo === "nuevo" ? (
          <FormHermano
            clienteId={clienteId}
            state={stateAdd}
            action={accionAdd}
            pending={pendingAdd}
            onCancel={() => setModo(null)}
          />
        ) : modo === null ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setModo("nuevo")}>
            <Plus className="size-4" /> Agregar hermano
          </Button>
        ) : null)}
    </div>
  );
}
