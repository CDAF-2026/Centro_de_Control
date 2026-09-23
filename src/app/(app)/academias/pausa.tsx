"use client";

import { useActionState, useState, useTransition } from "react";
import { pausarAcademias, reactivarAcademias, type AcademiaFormState } from "./actions";
import { Button } from "@/components/ui/button";

/**
 * El interruptor de vacaciones. Un solo control con dos estados, siempre a la
 * vista en Academias: si nadie reactiva, nada falla —solo dejan de pedirse
 * cierres—, así que el estado tiene que gritar mientras dure.
 */
export function PausaAcademias({
  pausaDesde,
  hoy,
  puedePausar,
}: {
  /** Texto ya formateado ("15 de dic") o null si están activas. */
  pausaDesde: string | null;
  hoy: string;
  /** Solo el superadministrador (`PUEDE_PAUSAR_ACADEMIAS`). */
  puedePausar: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [state, action, pending] = useActionState<AcademiaFormState, FormData>(pausarAcademias, {});
  const [reactivando, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  if (pausaDesde) {
    return (
      <div
        role="status"
        className="bg-warning/15 ring-warning/40 flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 ring-1"
      >
        <div className="flex items-center gap-3">
          <span className="bg-warning ring-warning/25 size-2.5 shrink-0 rounded-full ring-4" />
          <div>
            <p className="font-heading text-sm font-bold text-[#6d4700]">Academias en pausa desde el {pausaDesde}</p>
            <p className="text-xs text-[#6d4700]">
              No se piden cierres de academia hasta reactivar. El planeador y los festivos no se tocan.
            </p>
          </div>
        </div>
        {puedePausar && (
          <Button
            type="button"
            disabled={reactivando}
            className="bg-warning hover:bg-warning/90 text-[#2a1c00]"
            onClick={() =>
              start(async () => {
                const r = await reactivarAcademias();
                setMsg(r.error ?? r.ok ?? null);
              })
            }
          >
            {reactivando ? "Reactivando…" : "Reactivar academias"}
          </Button>
        )}
        {!puedePausar && (
          <p className="text-xs text-[#6d4700]">Solo el superadministrador puede reactivarlas.</p>
        )}
        {msg && <p className="w-full text-xs text-[#6d4700]">{msg}</p>}
      </div>
    );
  }

  return (
    <div className="ring-foreground/[0.06] bg-card flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 shadow-sm ring-1">
      <div className="flex items-center gap-3">
        <span className="bg-lime ring-lime/25 size-2.5 shrink-0 rounded-full ring-4" />
        <div>
          <p className="font-heading text-sm font-bold">Academias activas</p>
          <p className="text-muted-foreground text-xs">Las clases del planeador llegan solas a Cierre de clases.</p>
        </div>
      </div>
      {puedePausar && (
        <Button type="button" variant="outline" onClick={() => setAbierto((v) => !v)}>
          {abierto ? "Cancelar" : "Pausar academias"}
        </Button>
      )}
      {puedePausar && abierto && (
        <form action={action} className="border-border flex w-full flex-wrap items-center gap-3 border-t border-dashed pt-3">
          <label htmlFor="desde" className="text-muted-foreground flex items-center gap-2 text-xs">
            Pausar desde
            <input
              id="desde"
              name="desde"
              type="date"
              defaultValue={hoy}
              max={hoy}
              className="border-input bg-background h-9 rounded-md border px-2 text-sm"
            />
          </label>
          <p className="text-muted-foreground min-w-56 flex-1 text-xs">
            Desde ese día no se piden cierres de academia. Al reactivar, las vacaciones no vuelven a aparecer como
            pendientes.
          </p>
          <Button type="submit" disabled={pending} className="bg-warning hover:bg-warning/90 text-[#2a1c00]">
            {pending ? "Pausando…" : "Pausar academias"}
          </Button>
          {state.error && <p className="text-destructive w-full text-xs">{state.error}</p>}
        </form>
      )}
      {state.ok && <p className="w-full text-xs">{state.ok}</p>}
    </div>
  );
}
