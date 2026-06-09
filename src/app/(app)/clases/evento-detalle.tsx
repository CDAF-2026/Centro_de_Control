"use client";

import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { AsignarPaquete } from "./asignar-paquete";
import type { CalEvento } from "./types";

const TONE: Record<string, "secondary" | "outline" | "destructive"> = {
  ok: "secondary",
  warn: "outline",
  bad: "destructive",
};

/** Cuerpo del modal de detalle de un evento (clase interna o reserva EasyCancha). */
export function EventoDetalle({ ev, canAssign = false }: { ev: CalEvento; canAssign?: boolean }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>{ev.titulo}</DialogTitle>
        <DialogDescription>{ev.subtitulo}</DialogDescription>
      </DialogHeader>
      <div className="space-y-1.5 text-sm">
        {ev.detalles.map(([k, v]) => (
          <p key={k}>
            <span className="text-muted-foreground">{k}: </span>
            {v}
          </p>
        ))}
        <p className="flex items-center gap-2 pt-1">
          <span className="text-muted-foreground">Estado:</span>
          <Badge variant={TONE[ev.estadoTone]}>{ev.estadoLabel}</Badge>
        </p>
      </div>
      {canAssign && ev.ec && !ev.cancelada && <AsignarPaquete ev={ev} />}
    </>
  );
}
