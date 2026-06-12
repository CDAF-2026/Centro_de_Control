"use client";

import { useActionState } from "react";
import { reprogramarClase, cancelarClase, type AcademiaFormState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const init: AcademiaFormState = {};

export function ClaseAcademiaRow({
  academiaId,
  clase,
}: {
  academiaId: number;
  clase: { id: number; fecha: string; hora_inicio: string | null; hora_fin: string | null };
}) {
  const [stateR, reprog, pR] = useActionState(reprogramarClase, init);
  const [stateC, cancel, pC] = useActionState(cancelarClase, init);
  const msg = stateR.ok || stateC.ok || stateR.error || stateC.error;
  const esError = !!(stateR.error || stateC.error);

  return (
    <li className="flex flex-wrap items-end gap-2 border-t py-2">
      <form action={reprog} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="claseId" value={clase.id} />
        <input type="hidden" name="academiaId" value={academiaId} />
        <Input name="fecha" type="date" defaultValue={clase.fecha} className="h-8 w-36 text-xs" />
        <Input name="horaInicio" type="time" defaultValue={clase.hora_inicio?.slice(0, 5) ?? ""} className="h-8 w-24 text-xs" />
        <Input name="horaFin" type="time" defaultValue={clase.hora_fin?.slice(0, 5) ?? ""} className="h-8 w-24 text-xs" />
        <Button type="submit" size="sm" variant="outline" disabled={pR}>Guardar</Button>
      </form>
      <form action={cancel}>
        <input type="hidden" name="claseId" value={clase.id} />
        <input type="hidden" name="academiaId" value={academiaId} />
        <Button type="submit" size="sm" variant="ghost" disabled={pC}>Cancelar clase</Button>
      </form>
      {msg && <span className={`${esError ? "text-destructive" : "text-primary"} text-xs`}>{msg}</span>}
    </li>
  );
}
