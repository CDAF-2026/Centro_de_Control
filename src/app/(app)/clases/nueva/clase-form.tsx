"use client";

import { useActionState, useState } from "react";
import { createClaseIndividual, type ClaseFormState } from "../actions";
import { MiembroAutocomplete } from "@/components/miembro-autocomplete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: ClaseFormState = {};

export function ClaseForm({
  profesores,
  paquetes,
}: {
  profesores: { id: string; nombre: string | null }[];
  paquetes: { id: number; miembroId: number | null; label: string }[];
}) {
  const [state, action, pending] = useActionState(createClaseIndividual, initial);
  const fe = state.fieldErrors ?? {};
  const [miembroId, setMiembroId] = useState<number | null>(null);

  const paquetesMiembro = paquetes.filter((p) => p.miembroId != null && p.miembroId === miembroId);

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Deportista</Label>
        <MiembroAutocomplete onSelect={(sel) => setMiembroId(sel?.miembroId ?? null)} />
        {fe.clienteId && <p className="text-destructive text-sm">{fe.clienteId}</p>}
      </div>

      {miembroId && (
        <div className="space-y-1.5">
          <Label htmlFor="paqueteClienteId">Cobrar a un paquete (opcional)</Label>
          <select
            id="paqueteClienteId"
            name="paqueteClienteId"
            className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            disabled={paquetesMiembro.length === 0}
          >
            <option value="">
              {paquetesMiembro.length === 0 ? "— Sin paquetes activos —" : "— Cobro aparte (no consume paquete) —"}
            </option>
            {paquetesMiembro.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          <p className="text-muted-foreground text-xs">
            Si eliges un paquete, al cerrar la clase como <strong>realizada</strong> se descuenta una sesión del saldo.
          </p>
        </div>
      )}

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
