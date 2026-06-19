"use client";

import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { MaterializarReserva } from "./asignar-paquete";
import type { CalEvento } from "./types";

const TONE: Record<string, "success" | "warning" | "destructive"> = {
  ok: "success",
  warn: "warning",
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
      <div className="bg-muted/40 space-y-2 rounded-lg p-3 text-sm">
        {ev.detalles.map(([k, v]) => (
          <p key={k} className="flex items-baseline justify-between gap-3">
            <span className="text-muted-foreground shrink-0">{k}</span>
            <span className="text-right font-medium">{v}</span>
          </p>
        ))}
        <p className="flex items-center justify-between gap-3 border-t pt-2">
          <span className="text-muted-foreground">Estado</span>
          <Badge variant={TONE[ev.estadoTone] ?? "outline"}>{ev.estadoLabel}</Badge>
        </p>
      </div>
      {canAssign && ev.ec && !ev.cancelada && <MaterializarReserva ev={ev} />}
    </>
  );
}
