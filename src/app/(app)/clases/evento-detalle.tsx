"use client";

import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { MaterializarReserva } from "./asignar-paquete";
import { ValorClaseForm } from "./valor-clase-form";
import { ProfesorClaseForm } from "./profesor-clase-form";
import type { CalEvento } from "./types";

const TONE: Record<string, "success" | "warning" | "destructive"> = {
  ok: "success",
  warn: "warning",
  bad: "destructive",
};

/** Cuerpo del modal de detalle de un evento (clase interna o reserva EasyCancha). */
export function EventoDetalle({
  ev,
  canAssign = false,
  onCerrar,
}: {
  ev: CalEvento;
  canAssign?: boolean;
  /** Cierra el modal (lo usa la edición de valor tras confirmar el guardado). */
  onCerrar?: () => void;
}) {
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
            {/* La clase sin profesor no muestra un guión resignado: muestra el
                selector para arreglarlo, justo donde se ve el hueco. */}
            {k === "Profesor" && canAssign && ev.sinProfesor && !ev.cancelada ? (
              <ProfesorClaseForm
                claseId={ev.sinProfesor.claseId}
                opciones={ev.sinProfesor.opciones}
                deporte={ev.deporte}
                onGuardado={onCerrar}
              />
            ) : (
              <span className="text-right font-medium">{v}</span>
            )}
          </p>
        ))}
        <p className="flex items-center justify-between gap-3 border-t pt-2">
          <span className="text-muted-foreground">Estado</span>
          <Badge variant={TONE[ev.estadoTone] ?? "outline"}>{ev.estadoLabel}</Badge>
        </p>
        {/* Solo en clases particulares: corregir lo que se cobró (ver editarValorClase). */}
        {canAssign && ev.particular && !ev.cancelada && (
          <ValorClaseForm
            claseId={ev.particular.claseId}
            valor={ev.particular.valor}
            editable={ev.particular.editable}
            aviso={ev.particular.aviso}
            onGuardado={onCerrar}
          />
        )}
      </div>
      {canAssign && ev.ec && !ev.cancelada && <MaterializarReserva ev={ev} />}
    </>
  );
}
