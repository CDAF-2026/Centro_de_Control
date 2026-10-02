"use client";

import { useActionState } from "react";
import { decidirCambio, asignarFirma, aplicarSolicitud, descartarSolicitud, type RevisionState } from "./actions";
import { MiembroAutocomplete } from "@/components/miembro-autocomplete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const inicial: RevisionState = {};

function Mensaje({ state }: { state: RevisionState }) {
  if (state.error) return <p className="text-destructive text-xs">{state.error}</p>;
  if (state.ok) return <p className="text-xs text-[#46530a]">{state.ok}</p>;
  return null;
}

/** Aprobar / Rechazar un cambio de facturación. */
export function DecidirCambio({ cambioId, esNit }: { cambioId: number; esNit: boolean }) {
  const [state, action, pending] = useActionState(decidirCambio, inicial);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="cambioId" value={cambioId} />
      <Button type="submit" name="decision" value="aprobar" size="sm" disabled={pending}>Aprobar</Button>
      <Button type="submit" name="decision" value="rechazar" size="sm" variant="outline" disabled={pending}>Rechazar</Button>
      {esNit && <span className="text-muted-foreground text-xs">Aprobar atará las facturas libres de ese NIT a esta ficha.</span>}
      <Mensaje state={state} />
    </form>
  );
}

/** Asignar una firma sin dueño claro a un deportista. */
export function AsignarFirma({ firmaId }: { firmaId: string }) {
  const [state, action, pending] = useActionState(asignarFirma, inicial);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="firmaId" value={firmaId} />
      <MiembroAutocomplete miembroName="miembroId" clienteName="clienteId" />
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>Asignar a este deportista</Button>
        <Mensaje state={state} />
      </div>
    </form>
  );
}

/** Aplicar o descartar una solicitud de datos ambigua. */
export function RevisarSolicitud({ solicitudId }: { solicitudId: string }) {
  const [sA, aplicar, pA] = useActionState(aplicarSolicitud, inicial);
  const [sD, descartar, pD] = useActionState(descartarSolicitud, inicial);
  return (
    <div className="space-y-3">
      <form action={aplicar} className="space-y-2">
        <input type="hidden" name="solicitudId" value={solicitudId} />
        <MiembroAutocomplete miembroName="miembroId" clienteName="clienteId" />
        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" disabled={pA}>Aplicar a este deportista</Button>
          <Mensaje state={sA} />
        </div>
      </form>
      <form action={descartar} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="solicitudId" value={solicitudId} />
        <Input name="motivo" placeholder="Motivo para descartar" className="h-8 max-w-xs text-sm" />
        <Button type="submit" size="sm" variant="ghost" disabled={pD}>Descartar</Button>
        <Mensaje state={sD} />
      </form>
    </div>
  );
}
