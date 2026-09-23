"use client";

import { useActionState } from "react";
import { guardarClase, eliminarClase, type AcademiaFormState } from "../actions";
import { DURACIONES, DIAS } from "@/lib/validations/academia";
import type { OpcionProfesor } from "@/lib/staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: AcademiaFormState = {};
const SELECT = "border-input bg-background h-9 w-full rounded-md border px-3 text-sm";

export type ClaseValores = {
  id: number;
  profesorId: string;
  dia: number;
  hora: string;
  duracion: number;
  cancha: string | null;
  colegio: string | null;
  ninos: number;
};

/**
 * Crear o editar una clase del planeador.
 *
 * No se le pide academia ni cupo: la academia es de cada niño (una clase mezcla
 * recreativa y competencia) y el cupo el club no lo lleva.
 */
export function ClaseForm({
  profesores,
  deporte,
  valores = null,
  profesorInicial = "",
}: {
  profesores: OpcionProfesor[];
  deporte: "tenis" | "padel";
  valores?: ClaseValores | null;
  profesorInicial?: string;
}) {
  const [state, action, pending] = useActionState(guardarClase, initial);
  const fe = state.fieldErrors ?? {};
  const delDeporte = profesores.filter((p) => p.delDeporte);
  const sinMarcar = profesores.filter((p) => !p.delDeporte);

  return (
    <div className="space-y-6">
      <form action={action} className="space-y-4">
        {valores && <input type="hidden" name="claseId" value={valores.id} />}
        <input type="hidden" name="deporte" value={deporte} />

        <div className="space-y-1.5">
          <Label htmlFor="profesorId">Profesor</Label>
          <select
            id="profesorId"
            name="profesorId"
            className={SELECT}
            defaultValue={valores?.profesorId ?? profesorInicial}
            required
          >
            <option value="">— Escoge —</option>
            {delDeporte.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
            {sinMarcar.length > 0 && (
              <optgroup label="Sin deporte asignado">
                {sinMarcar.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </optgroup>
            )}
          </select>
          {fe.profesorId && <p className="text-destructive text-sm">{fe.profesorId}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="dia">Día</Label>
            <select id="dia" name="dia" className={SELECT} defaultValue={String(valores?.dia ?? 1)}>
              {DIAS.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
            {fe.dia && <p className="text-destructive text-sm">{fe.dia}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hora">Hora de inicio</Label>
            <Input id="hora" name="hora" type="time" defaultValue={valores?.hora ?? "15:00"} required />
            {fe.hora && <p className="text-destructive text-sm">{fe.hora}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="duracion">Duración</Label>
            <select id="duracion" name="duracion" className={SELECT} defaultValue={String(valores?.duracion ?? 60)}>
              {DURACIONES.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
            {fe.duracion && <p className="text-destructive text-sm">{fe.duracion}</p>}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="cancha">Cancha (opcional)</Label>
          <Input id="cancha" name="cancha" defaultValue={valores?.cancha ?? ""} placeholder="4" />
          <p className="text-muted-foreground text-xs">
            El planeador del club no la trae. Sirve para reconocer el bloqueo de EasyCancha al
            registrar la clase; no bloquea nada.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="colegio">Colegio (opcional)</Label>
          <Input
            id="colegio"
            name="colegio"
            defaultValue={valores?.colegio ?? ""}
            placeholder="Montessori"
            disabled={!!valores && valores.ninos > 0}
          />
          <p className="text-muted-foreground text-xs">
            Solo si la clase es para un colegio. Esa clase no lleva niños inscritos: al cerrarla
            solo se dice si se dictó.
            {valores && valores.ninos > 0 && " Esta clase tiene niños, así que no puede ser de colegio."}
          </p>
        </div>

        {state.error && <p className="text-destructive text-sm">{state.error}</p>}

        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : valores ? "Guardar cambios" : "Crear clase"}
        </Button>
      </form>

      {valores && (
        <form
          action={async () => {
            await eliminarClase(valores.id);
          }}
          className="border-destructive/30 space-y-2 rounded-xl border p-4"
        >
          <p className="text-sm font-medium">Borrar esta clase</p>
          <p className="text-muted-foreground text-xs">
            {valores.ninos === 0
              ? "No viene nadie: se borra sin más."
              : `Vienen ${valores.ninos} ${valores.ninos === 1 ? "niño" : "niños"}. Siguen matriculados y se quedan sin este día; si era el único de alguno, se avisa con su nombre.`}
          </p>
          <Button type="submit" variant="destructive" size="sm">Borrar clase</Button>
        </form>
      )}
    </div>
  );
}
