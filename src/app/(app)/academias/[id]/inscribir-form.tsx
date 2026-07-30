"use client";

import { useActionState, useState } from "react";
import { inscribirCliente, type AcademiaFormState } from "../actions";
import { NIVELES, DURACIONES, DIAS } from "@/lib/validations/academia";
import { MiembroAutocomplete } from "@/components/miembro-autocomplete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HorarioFila, HorarioCabecera, type Profesor } from "./horario-fila";

const initial: AcademiaFormState = {};
const SELECT = "border-input bg-background h-9 w-full rounded-md border px-3 text-sm";

/**
 * Inscribe un niño con SUS horarios. Cada fila es una venida a la semana, con su
 * propio profesor y cancha: así se puede decir "martes 16:30 con Jorge y sábado
 * 12:00 con Graciano", que es lo que el modelo viejo no podía representar.
 */
export function InscribirForm({
  academiaId,
  profesores,
}: {
  academiaId: number;
  profesores: Profesor[];
}) {
  const [state, action, pending] = useActionState(inscribirCliente, initial);
  // Cada número es solo una llave de React; los valores viven en el DOM del form.
  const [filas, setFilas] = useState<number[]>([0]);
  const [siguiente, setSiguiente] = useState(1);

  function agregar() {
    setFilas((f) => [...f, siguiente]);
    setSiguiente((n) => n + 1);
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="academiaId" value={academiaId} />

      <div className="grid gap-3 sm:grid-cols-[minmax(14rem,1fr)_10rem_5.5rem]">
        <div className="space-y-1.5">
          <Label>Niño</Label>
          <MiembroAutocomplete />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nivel">Nivel</Label>
          <select id="nivel" name="nivel" className={SELECT}>
            <option value="">— Sin definir —</option>
            {NIVELES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="descuento">Desc. %</Label>
          <Input id="descuento" name="descuento" type="number" min={0} max={100} defaultValue={0} />
        </div>
      </div>

      <div className="space-y-1.5">
        <div>
          <Label>Días que asiste</Label>
          <p className="text-muted-foreground text-xs">
            Una fila por cada día. Si un día lo atiende otro profesor o es en otra cancha, se pone en su fila.
          </p>
        </div>

        <HorarioCabecera />
        <div className="space-y-2">
          {filas.map((k, i) => (
            <HorarioFila
              key={k}
              profesores={profesores}
              dias={DIAS}
              duraciones={DURACIONES}
              onQuitar={filas.length > 1 ? () => setFilas((f) => f.filter((x) => x !== k)) : undefined}
              autoFocus={i > 0}
            />
          ))}
        </div>

        <Button type="button" variant="outline" size="sm" onClick={agregar}>
          + Otro día
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Inscribiendo…" : "Inscribir"}
        </Button>
        {state.error && <p className="text-destructive text-sm">{state.error}</p>}
        {state.ok && <p className="text-primary text-sm">{state.ok}</p>}
      </div>
    </form>
  );
}
