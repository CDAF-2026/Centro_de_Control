"use client";

import { useActionState, useState } from "react";
import { guardarCompensacion, type EmpleadoFormState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { CompensacionTipo } from "@/lib/database.types";

const init: EmpleadoFormState = {};
const SELECT = "border-input bg-background h-9 w-full rounded-md border px-2 text-sm";

export type Comp = {
  tipo: CompensacionTipo;
  pct_clase: number;
  salario_fijo: number;
  pago_asistencia: number;
  comision_quincenal: number;
};

/** Configura la compensación del profesor: tipo + campos + valor por alumno de sus academias.
 *  Todos los inputs viajan siempre (los no aplicables van ocultos) para no perder valores. */
export function CompensacionForm({
  profesorId,
  comp,
  academias,
}: {
  profesorId: string;
  comp: Comp;
  academias: { id: number; nombre: string; valor_alumno: number }[];
}) {
  const [state, action, pending] = useActionState(guardarCompensacion, init);
  const [tipo, setTipo] = useState<CompensacionTipo>(comp.tipo);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="profesorId" value={profesorId} />

      <div className="space-y-1.5">
        <Label htmlFor="tipo">Tipo de compensación</Label>
        <select
          id="tipo"
          name="tipo"
          value={tipo}
          onChange={(e) => setTipo(e.target.value as CompensacionTipo)}
          className={SELECT}
        >
          <option value="por_clase">Por clase (% por clase dictada)</option>
          <option value="fijo_comision">Salario fijo + comisión</option>
          <option value="fisico">Físico (pago por asistencia + comisión)</option>
        </select>
      </div>

      {/* % por clase y salario (por_clase / fijo_comision) */}
      <div className={cn("grid grid-cols-2 gap-3", tipo === "fisico" && "hidden")}>
        <div className={cn("space-y-1.5", tipo !== "fijo_comision" && "hidden")}>
          <Label htmlFor="salario_fijo">Salario fijo (COP / quincena)</Label>
          <Input id="salario_fijo" name="salario_fijo" type="number" min={0} defaultValue={String(comp.salario_fijo)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pct_clase">% por clase</Label>
          <Input id="pct_clase" name="pct_clase" type="number" min={0} max={100} defaultValue={String(comp.pct_clase)} />
        </div>
      </div>

      {/* Físico */}
      <div className={cn("grid grid-cols-2 gap-3", tipo !== "fisico" && "hidden")}>
        <div className="space-y-1.5">
          <Label htmlFor="pago_asistencia">Pago por asistencia (COP)</Label>
          <Input id="pago_asistencia" name="pago_asistencia" type="number" min={0} defaultValue={String(comp.pago_asistencia)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="comision_quincenal">Comisión quincenal (COP)</Label>
          <Input id="comision_quincenal" name="comision_quincenal" type="number" min={0} defaultValue={String(comp.comision_quincenal)} />
        </div>
      </div>

      {academias.length > 0 && (
        <div className="space-y-2 border-t pt-3">
          <Label>Pago por alumno en academias</Label>
          <p className="text-muted-foreground -mt-1 text-xs">
            Lo que gana por cada alumno presente en cada una de sus academias.
          </p>
          {academias.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3">
              <span className="text-sm">{a.nombre}</span>
              <Input
                name={`academia_${a.id}`}
                type="number"
                min={0}
                defaultValue={String(a.valor_alumno)}
                className="w-40"
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar compensación"}</Button>
        {state.error && <span className="text-destructive text-sm">{state.error}</span>}
        {state.ok && <span className="text-primary text-sm">{state.ok}</span>}
      </div>
    </form>
  );
}
