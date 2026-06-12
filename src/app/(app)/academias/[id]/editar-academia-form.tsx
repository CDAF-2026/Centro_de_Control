"use client";

import { useActionState } from "react";
import { updateAcademia, type AcademiaFormState } from "../actions";
import { DIAS } from "@/lib/validations/academia";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: AcademiaFormState = {};

export type AcademiaEditable = {
  id: number;
  nombre: string;
  deporte: "tenis" | "padel";
  nivel: string | null;
  profesor_id: string | null;
  cancha: string | null;
  precio: number;
  matricula: number;
  periodo_inicio: string | null;
  periodo_fin: string | null;
  dias_semana: number[];
  hora_inicio: string | null;
  hora_fin: string | null;
};

export function EditarAcademiaForm({
  academia,
  profesores,
}: {
  academia: AcademiaEditable;
  profesores: { id: string; nombre: string | null }[];
}) {
  const [state, action, pending] = useActionState(updateAcademia, initial);
  const fe = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={academia.id} />

      <div className="space-y-1.5">
        <Label htmlFor="nombre">Nombre</Label>
        <Input id="nombre" name="nombre" required defaultValue={academia.nombre} />
        {fe.nombre && <p className="text-destructive text-sm">{fe.nombre}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="deporte">Deporte</Label>
          <select id="deporte" name="deporte" defaultValue={academia.deporte} className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm">
            <option value="tenis">Tenis</option>
            <option value="padel">Pádel</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nivel">Nivel</Label>
          <Input id="nivel" name="nivel" defaultValue={academia.nivel ?? ""} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="profesorId">Profesor</Label>
          <select id="profesorId" name="profesorId" defaultValue={academia.profesor_id ?? ""} className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm">
            <option value="">— Sin asignar —</option>
            {profesores.map((p) => <option key={p.id} value={p.id}>{p.nombre ?? p.id}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cancha">Cancha</Label>
          <Input id="cancha" name="cancha" defaultValue={academia.cancha ?? ""} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="precio">Precio (COP)</Label>
          <Input id="precio" name="precio" type="number" min={0} defaultValue={academia.precio} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="matricula">Matrícula (COP)</Label>
          <Input id="matricula" name="matricula" type="number" min={0} defaultValue={academia.matricula} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Días de la semana</Label>
        <div className="flex flex-wrap gap-3">
          {DIAS.map((d) => (
            <label key={d.value} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="dias" value={d.value} defaultChecked={academia.dias_semana.includes(d.value)} /> {d.label}
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="horaInicio">Hora inicio</Label>
          <Input id="horaInicio" name="horaInicio" type="time" defaultValue={academia.hora_inicio?.slice(0, 5) ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="horaFin">Hora fin</Label>
          <Input id="horaFin" name="horaFin" type="time" defaultValue={academia.hora_fin?.slice(0, 5) ?? ""} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="periodoInicio">Periodo: inicio</Label>
          <Input id="periodoInicio" name="periodoInicio" type="date" defaultValue={academia.periodo_inicio ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="periodoFin">Periodo: fin</Label>
          <Input id="periodoFin" name="periodoFin" type="date" defaultValue={academia.periodo_fin ?? ""} />
        </div>
      </div>

      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar cambios"}</Button>
      <p className="text-muted-foreground text-xs">
        Si cambiaste días, horas o periodo, vuelve a la ficha y usa <strong>“Generar programación”</strong> para recrear el calendario.
      </p>
    </form>
  );
}
