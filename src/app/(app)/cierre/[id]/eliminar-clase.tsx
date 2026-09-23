"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { eliminarClasePendiente } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Eliminar una clase pendiente por cerrar. Solo lo ve el superadministrador
 * (la página decide; la acción lo vuelve a exigir). Pide confirmación en la
 * misma tarjeta — el visor no muestra `confirm()` y un clic suelto no debe
 * borrar nada.
 */
export function EliminarClase({ claseId, dePlaneador }: { claseId: number; dePlaneador: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="border-destructive/30 space-y-3 rounded-xl border p-4">
      {!abierto ? (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="text-destructive inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
        >
          <Trash2 className="size-4" /> Eliminar esta clase
        </button>
      ) : (
        <>
          <p className="text-sm font-medium">¿Eliminar esta clase pendiente?</p>
          <p className="text-muted-foreground text-xs">
            {dePlaneador
              ? "Sale del planeador de academias: queda como «no se dictó» con este motivo, para que el planeador no la vuelva a pedir."
              : "Se borra y deja de aparecer en Cierre de clases. Si venía de una reserva de EasyCancha, esa reserva vuelve a quedar sin registrar en el calendario."}
          </p>
          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (opcional)" />
          {error && <p className="text-destructive text-sm">{error}</p>}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await eliminarClasePendiente(claseId, motivo);
                  if (r?.error) setError(r.error);
                })
              }
            >
              {pending ? "Eliminando…" : "Sí, eliminar"}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
