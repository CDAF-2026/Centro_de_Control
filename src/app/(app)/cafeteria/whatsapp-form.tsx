"use client";

import { useActionState, useState } from "react";
import { guardarWhatsapp, type CafeteriaState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const inicial: CafeteriaState = {};

/**
 * El número de WhatsApp a donde llegan los pedidos, en una tarjeta pequeña al pie
 * de la columna. Lo ve todo el que administra la carta; lo cambian solo el
 * superadministrador y la coordinación administrativa (un número mal escrito
 * manda los pedidos a un desconocido).
 */
export function WhatsappForm({ whatsapp, puedeCambiar }: { whatsapp: string; puedeCambiar: boolean }) {
  const [estado, accion, guardando] = useActionState(guardarWhatsapp, inicial);
  const [cambiando, setCambiando] = useState(false);

  return (
    <div className="bg-card space-y-1.5 rounded-xl p-3.5 shadow-sm ring-1 ring-foreground/[0.06]">
      <h2 className="font-heading text-xs font-bold tracking-[0.08em] uppercase">WhatsApp de pedidos</h2>

      {cambiando && puedeCambiar ? (
        <form action={accion} className="space-y-1.5">
          <div className="flex gap-1.5">
            <Input id="whatsapp" name="whatsapp" aria-label="Número con indicativo" inputMode="numeric" defaultValue={whatsapp} placeholder="573001234567" maxLength={20} className="h-9 text-sm tabular-nums" />
            <Button type="submit" size="sm" className="h-9" disabled={guardando}>{guardando ? "…" : "Guardar"}</Button>
          </div>
          <p className="text-muted-foreground text-xs">Colombia es 57 y luego el celular, sin espacios.</p>
          {estado.error && <p className="text-destructive text-xs">{estado.fieldErrors?.whatsapp ?? estado.error}</p>}
          {estado.ok && <p className="text-xs font-medium text-[#46530a]">{estado.ok}</p>}
          <button type="button" onClick={() => setCambiando(false)} className="text-muted-foreground text-xs font-semibold hover:underline">Cerrar</button>
        </form>
      ) : (
        <>
          {whatsapp ? (
            <p className="font-heading text-sm font-semibold tabular-nums">+{whatsapp}</p>
          ) : (
            <p className="text-sm text-[#8a5600]">Todavía no hay número.</p>
          )}
          {puedeCambiar ? (
            <button type="button" onClick={() => setCambiando(true)} className="text-xs font-semibold text-[#46530a] hover:underline">
              {whatsapp ? "Cambiar el número" : "Poner el número"}
            </button>
          ) : (
            <p className="text-muted-foreground text-xs">Lo cambian el superadministrador o la coordinación administrativa.</p>
          )}
        </>
      )}
    </div>
  );
}
