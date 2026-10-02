"use client";

import { useActionState, useState } from "react";
import { decidirCambios, asignarFirma, aplicarSolicitud, descartarSolicitud, type RevisionState } from "./actions";
import { MiembroAutocomplete } from "@/components/miembro-autocomplete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const inicial: RevisionState = {};

function Mensaje({ state }: { state: RevisionState }) {
  if (state.error) return <p className="text-destructive text-xs">{state.error}</p>;
  if (state.ok) return <p className="text-xs text-[#46530a]">{state.ok}</p>;
  return null;
}

/** Aprobar o rechazar, de una vez, todos los cambios de facturación de una ficha. */
export function DecidirCambios({ ids, esNit }: { ids: number[]; esNit: boolean }) {
  const [state, action, pending] = useActionState(decidirCambios, inicial);
  const n = ids.length;
  return (
    <form action={action} className="flex flex-wrap items-center justify-between gap-3">
      <input type="hidden" name="cambioIds" value={ids.join(",")} />
      <span className="text-muted-foreground text-xs">{esNit ? "Al aprobar el NIT, las facturas de Siigo de ese NIT quedan atadas a esta ficha." : ""}</span>
      <div className="flex items-center gap-2">
        <Mensaje state={state} />
        <Button type="submit" name="decision" value="rechazar" variant="outline" disabled={pending}>Rechazar</Button>
        <Button type="submit" name="decision" value="aprobar" disabled={pending}>{n > 1 ? `Aprobar los ${n} cambios` : "Aprobar"}</Button>
      </div>
    </form>
  );
}

export type CandidatoFicha = { miembro_id: number; cliente_id: number; nombre: string; detalle: string };

/** Tarjetas de radio con las fichas candidatas, y "Otra ficha…" con el buscador. */
function ElegirFicha({ name, candidatos }: { name: string; candidatos: CandidatoFicha[] }) {
  const [elegido, setElegido] = useState<number | "otra" | null>(candidatos.length === 1 ? candidatos[0].miembro_id : null);
  return (
    <div className="space-y-3">
      {candidatos.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {candidatos.map((c) => (
            <label
              key={c.miembro_id}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors",
                elegido === c.miembro_id ? "border-primary bg-primary/10 ring-1 ring-primary" : "border-border hover:bg-muted/50",
              )}
            >
              <input type="radio" name={name} value={c.miembro_id} checked={elegido === c.miembro_id} onChange={() => setElegido(c.miembro_id)} className="accent-stadium size-4" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-semibold">{c.nombre} · ficha {c.cliente_id}</span>
                <span className="text-muted-foreground truncate text-xs">{c.detalle}</span>
              </span>
            </label>
          ))}
        </div>
      )}
      <label className="text-muted-foreground flex items-center gap-2 text-xs">
        <input type="radio" name={`${name}-modo`} checked={elegido === "otra"} onChange={() => setElegido("otra")} className="accent-stadium size-3.5" />
        Otra ficha…
      </label>
      {elegido === "otra" && <MiembroAutocomplete miembroName={name} clienteName={`${name}Cliente`} />}
    </div>
  );
}

/** Asignar una firma sin dueño claro a un deportista. */
export function AsignarFirma({ firmaId, candidatos }: { firmaId: string; candidatos: CandidatoFicha[] }) {
  const [state, action, pending] = useActionState(asignarFirma, inicial);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="firmaId" value={firmaId} />
      <ElegirFicha name="miembroId" candidatos={candidatos} />
      <div className="flex items-center justify-end gap-2">
        <Mensaje state={state} />
        <Button type="submit" disabled={pending}>Asignar la firma</Button>
      </div>
    </form>
  );
}

/** Aplicar o descartar una solicitud de datos ambigua. */
export function RevisarSolicitud({ solicitudId, candidatos }: { solicitudId: string; candidatos: CandidatoFicha[] }) {
  const [sA, aplicar, pA] = useActionState(aplicarSolicitud, inicial);
  const [sD, descartar, pD] = useActionState(descartarSolicitud, inicial);
  const [descartando, setDescartando] = useState(false);
  return (
    <div className="space-y-3">
      <form action={aplicar} className="space-y-3">
        <input type="hidden" name="solicitudId" value={solicitudId} />
        <ElegirFicha name="miembroId" candidatos={candidatos} />
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Mensaje state={sA} />
          <Button type="button" variant="outline" onClick={() => setDescartando((v) => !v)}>Descartar…</Button>
          <Button type="submit" disabled={pA}>Aplicar a la ficha elegida</Button>
        </div>
      </form>
      {descartando && (
        <form action={descartar} className="flex flex-wrap items-center justify-end gap-2 border-t pt-3">
          <input type="hidden" name="solicitudId" value={solicitudId} />
          <Input name="motivo" placeholder="Motivo para descartar" className="h-9 max-w-sm" autoFocus />
          <Button type="submit" variant="destructive" disabled={pD}>Descartar</Button>
          <Mensaje state={sD} />
        </form>
      )}
    </div>
  );
}
