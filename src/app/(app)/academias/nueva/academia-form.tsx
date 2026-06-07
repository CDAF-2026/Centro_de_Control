"use client";

import { useActionState } from "react";
import { createAcademia, type AcademiaFormState } from "../actions";
import { DIAS } from "@/lib/validations/academia";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: AcademiaFormState = {};

export function AcademiaForm({
  profesores,
}: {
  profesores: { id: string; nombre: string | null }[];
}) {
  const [state, action, pending] = useActionState(createAcademia, initial);
  const fe = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="nombre">Nombre</Label>
        <Input id="nombre" name="nombre" required />
        {fe.nombre && <p className="text-destructive text-sm">{fe.nombre}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="deporte">Deporte</Label>
          <select id="deporte" name="deporte" className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm">
            <option value="tenis">Tenis</option>
            <option value="padel">Pádel</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nivel">Nivel</Label>
          <Input id="nivel" name="nivel" placeholder="Juvenil, principiante…" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="profesorId">Profesor</Label>
          <select id="profesorId" name="profesorId" className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm">
            <option value="">— Sin asignar —</option>
            {profesores.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre ?? p.id}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cancha">Cancha</Label>
          <Input id="cancha" name="cancha" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="precio">Precio (COP)</Label>
          <Input id="precio" name="precio" type="number" min={0} defaultValue={0} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="matricula">Matrícula (COP)</Label>
          <Input id="matricula" name="matricula" type="number" min={0} defaultValue={0} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Días de la semana</Label>
        <div className="flex flex-wrap gap-3">
          {DIAS.map((d) => (
            <label key={d.value} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="dias" value={d.value} /> {d.label}
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
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
          <Label htmlFor="periodoInicio">Periodo: inicio</Label>
          <Input id="periodoInicio" name="periodoInicio" type="date" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="periodoFin">Periodo: fin</Label>
          <Input id="periodoFin" name="periodoFin" type="date" />
        </div>
      </div>

      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Creando…" : "Crear academia"}
      </Button>
    </form>
  );
}
