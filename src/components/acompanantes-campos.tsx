"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { MAX_PERSONAS } from "@/lib/acompanantes";

/**
 * Una casilla por cada persona que tomó la clase además del titular (ver
 * `src/lib/acompanantes.ts`). Aparece sola al subir el nº de personas y se va al
 * volver a 1. Los nombres viven aquí y no en cada casilla: si se baja de 3 a 2 y
 * se vuelve a 3, el nombre ya escrito no se pierde.
 */
export function AcompanantesCampos({
  personas,
  iniciales,
  compacto = false,
  obligatorio = true,
}: {
  /** Total de personas, titular incluido. */
  personas: number;
  iniciales: string[];
  compacto?: boolean;
  /** false = se pueden dejar en blanco (el profesor los completa al cerrar). */
  obligatorio?: boolean;
}) {
  const [nombres, setNombres] = useState<string[]>(iniciales);
  const faltan = Math.min(MAX_PERSONAS, Math.max(0, personas)) - 1;
  if (faltan < 1) return null;

  return (
    <div className={compacto ? "space-y-1.5" : "space-y-2"}>
      <p className={compacto ? "text-muted-foreground text-xs" : "text-sm font-medium"}>
        {faltan === 1 ? "¿Quién más tomó la clase?" : "¿Quiénes más tomaron la clase?"}
        {!obligatorio && " (opcional: si no los sabes, el profesor los pone al cerrar la clase)"}
      </p>
      {Array.from({ length: faltan }, (_, i) => (
        <Input
          key={i}
          name="acompanante"
          aria-label={`Persona ${i + 2}`}
          value={nombres[i] ?? ""}
          onChange={(e) =>
            setNombres((prev) => {
              const sig = [...prev];
              sig[i] = e.target.value;
              return sig;
            })
          }
          required={obligatorio}
          minLength={2}
          autoComplete="off"
          placeholder={`Persona ${i + 2}: nombre y apellido`}
          className={compacto ? "h-8 text-sm" : "h-11 text-base"}
        />
      ))}
    </div>
  );
}
