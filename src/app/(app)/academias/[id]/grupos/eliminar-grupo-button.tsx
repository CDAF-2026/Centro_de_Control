"use client";

import { useState, useTransition } from "react";
import { eliminarGrupo } from "../../actions";
import { Button } from "@/components/ui/button";

/** Borrar un grupo con niños adentro los dejaría huérfanos: la acción lo rechaza. */
export function EliminarGrupoButton({ grupoId, academiaId }: { grupoId: number; academiaId: number }) {
  const [confirmando, setConfirmando] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!confirmando) {
    return (
      <div className="ml-auto">
        <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirmando(true)}>
          Eliminar grupo
        </Button>
        {err && <p className="text-destructive mt-1 text-xs">{err}</p>}
      </div>
    );
  }

  return (
    <div className="ml-auto text-right">
      <span className="mr-2 text-xs">¿Seguro?</span>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await eliminarGrupo(grupoId, academiaId);
            if (r?.error) {
              setErr(r.error);
              setConfirmando(false);
            }
          })
        }
      >
        {pending ? "Borrando…" : "Sí, eliminar"}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmando(false)}>
        No
      </Button>
    </div>
  );
}
