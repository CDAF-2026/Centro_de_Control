"use client";

import { useActionState, useState } from "react";
import { updateCatalogo, deleteCatalogo, type PaqueteFormState } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarCheck, Lock, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const init: PaqueteFormState = {};

export type PaqueteCatalogo = {
  id: number;
  nombre: string;
  deporte: "tenis" | "padel" | null;
  num_clases: number;
  activo: boolean;
};

const SELECT = "border-input bg-background h-8 w-full rounded-md border px-2 text-sm";

/** Las personas no tienen campo propio: viven en el nombre ("… · 2 personas"). */
function personasDe(nombre: string): number | null {
  const m = nombre.match(/(\d+)\s*personas?/i);
  return m ? Number(m[1]) : null;
}

/**
 * Tarjeta de un paquete del catálogo, estilo marcador: el dato que importa
 * (cuántas clases, para cuántas personas) en grande; el nombre como título.
 * Inactivo = gris, borde punteado y candado: existe por el historial de sus
 * clientes, pero no se ofrece al asignar.
 */
export function CatalogoCard({
  paquete,
  puedeConfig,
  puedeEliminar = false,
}: {
  paquete: PaqueteCatalogo;
  puedeConfig: boolean;
  /** Eliminar del catálogo es solo del superadministrador. */
  puedeEliminar?: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [state, action, pending] = useActionState(updateCatalogo, init);
  const [delState, delAction, delPending] = useActionState(deleteCatalogo, init);
  const fe = state.fieldErrors ?? {};
  const inactivo = !paquete.activo;
  const personas = personasDe(paquete.nombre);

  if (puedeConfig && editando) {
    return (
      <form action={action} className="bg-card space-y-3 rounded-xl p-4 shadow-md ring-1 ring-primary/40">
        <input type="hidden" name="id" value={paquete.id} />
        <p className="cdaf-eyebrow text-muted-foreground text-[11px]">Editar paquete</p>
        <div className="space-y-1">
          <Label htmlFor={`n${paquete.id}`} className="text-xs">Nombre</Label>
          <Input id={`n${paquete.id}`} name="nombre" defaultValue={paquete.nombre} required className="h-8 text-sm" />
          {fe.nombre && <p className="text-destructive text-xs">{fe.nombre}</p>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">N.º clases</Label>
            <Input name="numClases" type="number" min={1} defaultValue={String(paquete.num_clases)} className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Deporte</Label>
            <select name="deporte" defaultValue={paquete.deporte ?? ""} className={SELECT}>
              <option value="">Ambos</option>
              <option value="tenis">Tenis</option>
              <option value="padel">Pádel</option>
            </select>
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Estado</Label>
          <select name="activo" defaultValue={paquete.activo ? "true" : "false"} className={SELECT}>
            <option value="true">Activo · se ofrece al asignar</option>
            <option value="false">Inactivo · no se ofrece</option>
          </select>
        </div>
        {state.error && <p className="text-destructive text-xs">{state.error}</p>}
        {state.ok && <p className="text-primary text-xs">{state.ok}</p>}
        <div className="flex gap-2 pt-1">
          <Button type="submit" size="sm" disabled={pending}>{pending ? "Guardando…" : "Guardar"}</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditando(false)}>Cerrar</Button>
        </div>
      </form>
    );
  }

  return (
    <article
      className={cn(
        "group flex flex-col rounded-xl shadow-sm ring-1 transition-shadow",
        inactivo
          ? "bg-muted/40 text-muted-foreground ring-foreground/[0.06] [box-shadow:none] [outline:1.5px_dashed_var(--color-border)] outline-offset-[-1.5px]"
          : "bg-card ring-foreground/[0.06] hover:shadow-md",
      )}
    >
      <div className="flex-1 space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-heading flex items-center gap-2 text-base leading-snug font-semibold">
            {inactivo && <Lock className="size-4 shrink-0" aria-label="Inactivo" />}
            {paquete.nombre}
          </h3>
          {inactivo && <Badge variant="outline" className="shrink-0">Inactivo</Badge>}
        </div>

        <dl className="flex items-end gap-6">
          <div>
            <dd className="font-heading text-4xl leading-none font-bold tabular-nums">{paquete.num_clases}</dd>
            <dt className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
              <CalendarCheck className="size-3.5" /> {paquete.num_clases === 1 ? "clase" : "clases"}
            </dt>
          </div>
          {personas != null && (
            <div>
              <dd className="font-heading text-4xl leading-none font-bold tabular-nums">{personas}</dd>
              <dt className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
                <Users className="size-3.5" /> {personas === 1 ? "persona" : "personas"}
              </dt>
            </div>
          )}
        </dl>
      </div>

      {puedeConfig && (
        <div className="border-border/70 flex flex-wrap items-center gap-2 border-t px-5 py-3">
          {!confirmDel ? (
            <>
              <Button type="button" size="sm" variant="outline" onClick={() => setEditando(true)}>Editar</Button>
              {puedeEliminar && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  title="Solo si ningún cliente lo tiene asignado"
                  onClick={() => setConfirmDel(true)}
                >
                  Eliminar
                </Button>
              )}
            </>
          ) : (
            <form action={delAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={paquete.id} />
              <span className="text-muted-foreground text-xs">¿Eliminar este paquete?</span>
              <Button type="submit" size="sm" variant="destructive" disabled={delPending}>
                {delPending ? "Eliminando…" : "Sí, eliminar"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDel(false)}>
                Cancelar
              </Button>
            </form>
          )}
          {confirmDel && delState.error && <p className="text-destructive w-full text-xs">{delState.error}</p>}
        </div>
      )}
    </article>
  );
}
