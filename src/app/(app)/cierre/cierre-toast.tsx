"use client";

import { useEffect, useState } from "react";

const DETALLE: Record<string, string> = {
  realizada: "Registrada como realizada.",
  cancelada: "Registrada como cancelada.",
  no_show: "Registrada como no-show.",
};

export function CierreToast({ estado }: { estado: string }) {
  const [show, setShow] = useState(true);

  useEffect(() => {
    // Limpia el parámetro de la URL para que no reaparezca al refrescar.
    window.history.replaceState(null, "", "/cierre");
    const t = setTimeout(() => setShow(false), 4500);
    return () => clearTimeout(t);
  }, []);

  if (!show) return null;

  return (
    <div className="fixed top-4 left-1/2 z-50 w-[min(92vw,26rem)] -translate-x-1/2">
      <div className="border-lime bg-card flex items-start gap-3 rounded-lg border border-l-4 px-4 py-3 shadow-lg">
        <span className="text-lg leading-none">✅</span>
        <div className="flex-1">
          <p className="text-sm font-semibold">Tu cierre de clase se confirmó con éxito</p>
          <p className="text-muted-foreground text-xs">{DETALLE[estado] ?? "Registrada."}</p>
        </div>
        <button
          type="button"
          onClick={() => setShow(false)}
          className="text-muted-foreground hover:text-foreground shrink-0 text-sm"
          aria-label="Cerrar aviso"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
