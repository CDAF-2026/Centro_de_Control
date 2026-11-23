"use client";

import { useState, useTransition } from "react";
import { cambiarDisponible } from "./actions";
import { cn } from "@/lib/utils";

/**
 * El interruptor Disponible / No disponible de un producto: el pie de su tarjeta
 * en la carta del panel. Un toque y cambia: la pantalla responde de una y, si el
 * servidor lo rechaza, vuelve atrás y dice por qué (lo más común: prenderlo sin
 * haberle puesto precio).
 */
export function Interruptor({
  productoId,
  nombre,
  disponible,
  sinPrecio,
  puedeEditar,
}: {
  productoId: number;
  nombre: string;
  disponible: boolean;
  sinPrecio: boolean;
  puedeEditar: boolean;
}) {
  // `local` es lo que se pinta mientras el servidor contesta; después manda la prop.
  const [local, setLocal] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const encendido = local ?? disponible;

  const alternar = () => {
    const nuevo = !encendido;
    setError(null);
    setLocal(nuevo);
    iniciar(async () => {
      const r = await cambiarDisponible(productoId, nuevo);
      if (r.error) setError(r.error);
      setLocal(null);
    });
  };

  return (
    <div className="mt-auto border-t">
      <button
        type="button"
        role="switch"
        aria-checked={encendido}
        aria-label={`${nombre}: ${encendido ? "disponible" : "no disponible"}`}
        disabled={!puedeEditar || pendiente}
        title={!encendido && sinPrecio ? "Ponle el precio antes de dejarlo disponible" : undefined}
        onClick={alternar}
        className="group flex h-[46px] w-full items-center justify-between gap-2 px-3 disabled:cursor-not-allowed"
      >
        <span className={cn("text-xs font-semibold", encendido ? "text-foreground" : "text-muted-foreground")}>
          {encendido ? "Disponible" : "No disponible"}
        </span>
        <Pista encendido={encendido} className={cn("group-focus-visible:ring-3 group-focus-visible:ring-ring/50", pendiente && "opacity-70")} />
      </button>
      {error && <p className="text-destructive px-3 pb-2 text-xs">{error}</p>}
    </div>
  );
}

/** El dibujo del interruptor (la pista y la bolita), para reusarlo en el editor. */
export function Pista({ encendido, grande, className }: { encendido: boolean; grande?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "relative shrink-0 rounded-full transition-colors",
        grande ? "h-[30px] w-[52px]" : "h-6 w-10",
        encendido ? "bg-primary" : "bg-muted-foreground/35",
        className,
      )}
    >
      <span
        className={cn(
          "bg-card absolute rounded-full shadow-sm transition-transform",
          grande ? "top-[3px] left-[3px] size-6" : "top-0.5 left-0.5 size-5",
          encendido && (grande ? "translate-x-[22px]" : "translate-x-4"),
        )}
      />
    </span>
  );
}
