"use client";

import { useState, useTransition } from "react";
import { reabrirCierre } from "../actions";
import { Button } from "@/components/ui/button";

export function ReabrirButton({ claseId }: { claseId: number }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => {
          if (!confirm("¿Deshacer el cierre de esta clase? Volverá a 'pendiente de cierre' y, si consumió un paquete, se restaurará el saldo.")) return;
          setErr(null);
          start(async () => {
            const r = await reabrirCierre(claseId);
            if (r.error) setErr(r.error);
          });
        }}
      >
        {pending ? "Reabriendo…" : "Reabrir"}
      </Button>
      {err && <span className="text-destructive text-xs">{err}</span>}
    </div>
  );
}
