"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { guardarReceso, eliminarReceso, type AcademiaFormState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

const initial: AcademiaFormState = {};

export type Receso = { id: number; desde: string; hasta: string; motivo: string };
export type Festivo = { fecha: string; nombre: string };

/**
 * El calendario de la academia: qué días no hay clase y cuáles son de receso.
 *
 * Los dos se comportan distinto en la cola de cierre, y es a propósito:
 *  · festivo → no se propone. La academia no dicta (dicho por el club).
 *  · receso  → se propone igual, porque algunos niños sí van, pero no se
 *              reprocha si nadie la cierra.
 */
export function CalendarioAcademia({
  recesos,
  festivos,
  puedeEditar,
}: {
  recesos: Receso[];
  festivos: Festivo[];
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(guardarReceso, initial);
  const [abierto, setAbierto] = useState(false);
  const [borrando, start] = useTransition();
  const fe = state.fieldErrors ?? {};

  return (
    <section className="ring-foreground/[0.06] bg-card space-y-4 rounded-xl p-5 shadow-sm ring-1">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="cdaf-title text-base">Calendario</h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            En <strong>festivo</strong> la academia no dicta y la clase ni se pide cerrar. En{" "}
            <strong>receso</strong> sí se pide, porque algunos van — pero no se reprocha si nadie la cierra.
          </p>
        </div>
        {puedeEditar && (
          <Button variant="outline" size="sm" onClick={() => setAbierto((v) => !v)}>
            {abierto ? "Cancelar" : "+ Receso"}
          </Button>
        )}
      </div>

      {puedeEditar && abierto && (
        <form action={action} className="bg-muted/40 grid gap-3 rounded-lg p-3 sm:grid-cols-4 sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="desde">Desde</Label>
            <Input id="desde" name="desde" type="date" required />
            {fe.desde && <p className="text-destructive text-xs">{fe.desde}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hasta">Hasta</Label>
            <Input id="hasta" name="hasta" type="date" required />
            {fe.hasta && <p className="text-destructive text-xs">{fe.hasta}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="motivo">Qué es</Label>
            <Input id="motivo" name="motivo" placeholder="Receso de diciembre" required />
            {fe.motivo && <p className="text-destructive text-xs">{fe.motivo}</p>}
          </div>
          <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar"}</Button>
          {state.error && <p className="text-destructive text-sm sm:col-span-4">{state.error}</p>}
          {state.ok && <p className="text-sm sm:col-span-4">✓ {state.ok}</p>}
        </form>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <p className="cdaf-eyebrow text-muted-foreground mb-1.5 text-[11px]">Recesos</p>
          {recesos.length === 0 ? (
            <p className="text-muted-foreground text-sm">Ninguno cargado.</p>
          ) : (
            <ul className="divide-border divide-y text-sm">
              {recesos.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span>
                    {r.motivo}
                    <span className="text-muted-foreground tabular-nums"> · {r.desde} a {r.hasta}</span>
                  </span>
                  {puedeEditar && (
                    <button
                      type="button"
                      disabled={borrando}
                      onClick={() => start(async () => { await eliminarReceso(r.id); router.refresh(); })}
                      className="text-muted-foreground hover:text-destructive text-xs underline"
                    >
                      Quitar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="cdaf-eyebrow text-muted-foreground mb-1.5 text-[11px]">
            Próximos festivos · sin academia
          </p>
          {festivos.length === 0 ? (
            <p className="text-muted-foreground text-sm">No vienen festivos.</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {festivos.map((f) => (
                <li key={f.fecha}>
                  <Badge variant="outline" className="font-normal">
                    <span className="tabular-nums">{f.fecha}</span> · {f.nombre}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
