"use client";

import { useActionState } from "react";
import { createClaseIndividual, type ClaseFormState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: ClaseFormState = {};

export function ClaseForm({
  clientes,
  profesores,
}: {
  clientes: { id: number; nombres: string; apellidos: string }[];
  profesores: { id: string; nombre: string | null }[];
}) {
  const [state, action, pending] = useActionState(createClaseIndividual, initial);
  const fe = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="clienteId">Deportista</Label>
        <select id="clienteId" name="clienteId" required className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm">
          <option value="">— Selecciona —</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>{c.apellidos}, {c.nombres}</option>
          ))}
        </select>
        {fe.clienteId && <p className="text-destructive text-sm">{fe.clienteId}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="profesorId">Profesor</Label>
          <select id="profesorId" name="profesorId" className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm">
            <option value="">— Sin asignar —</option>
            {profesores.map((p) => <option key={p.id} value={p.id}>{p.nombre ?? p.id}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="deporte">Deporte</Label>
          <select id="deporte" name="deporte" className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm">
            <option value="tenis">Tenis</option>
            <option value="padel">Pádel</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="nivel">Nivel</Label>
          <Input id="nivel" name="nivel" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cancha">Cancha</Label>
          <Input id="cancha" name="cancha" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="fecha">Fecha</Label>
          <Input id="fecha" name="fecha" type="date" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="horaInicio">Hora inicio</Label>
          <Input id="horaInicio" name="horaInicio" type="time" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="horaFin">Hora fin</Label>
          <Input id="horaFin" name="horaFin" type="time" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="precio">Precio (COP)</Label>
          <Input id="precio" name="precio" type="number" min={0} defaultValue={0} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="descuento">Descuento %</Label>
          <Input id="descuento" name="descuento" type="number" min={0} max={100} defaultValue={0} />
        </div>
      </div>

      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      <Button type="submit" disabled={pending}>{pending ? "Creando…" : "Crear clase"}</Button>
    </form>
  );
}
