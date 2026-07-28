"use client";

import { useEffect, useRef } from "react";
import { marcarLeidas } from "./actions";

/**
 * Al abrir la bandeja, da por vistas las notas que le llegaron al usuario:
 * apaga el contador de la campanita sin resolverlas (siguen pendientes).
 */
export function MarcarLeidas({ notaIds }: { notaIds: number[] }) {
  const yaHecho = useRef(false);

  useEffect(() => {
    if (yaHecho.current || notaIds.length === 0) return;
    yaHecho.current = true;
    // Pequeño respiro: si la persona solo pasó de largo, no cuenta como leída.
    const t = setTimeout(() => {
      void marcarLeidas(notaIds);
    }, 1200);
    return () => clearTimeout(t);
  }, [notaIds]);

  return null;
}
