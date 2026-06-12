"use client";

import { useState, useTransition } from "react";
import { eliminarAcademia } from "../actions";
import { Button } from "@/components/ui/button";

export function EliminarAcademiaButton({ academiaId }: { academiaId: number }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled={pending}
        onClick={() => {
          if (!confirm("¿Eliminar esta academia? Se quitarán sus inscripciones y clases futuras. El historial de clases realizadas se conserva. Esta acción no se puede deshacer.")) return;
          setErr(null);
          start(async () => {
            const r = await eliminarAcademia(academiaId);
            if (r?.error) setErr(r.error);
          });
        }}
      >
        {pending ? "Eliminando…" : "Eliminar"}
      </Button>
      {err && <span className="text-destructive text-xs">{err}</span>}
    </>
  );
}
