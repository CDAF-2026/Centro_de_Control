"use client";

import { useActionState, useState } from "react";
import { updateServicio, deleteServicio, type ServicioState } from "./actions";
import type { Servicio } from "@/lib/database.types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const init: ServicioState = {};
const SELECT = "border-input bg-background h-8 w-full rounded-md border px-2 text-sm";
const CAT_LABEL: Record<string, string> = {
  academia: "Academia",
  paquete: "Paquete",
  particular: "Clase particular",
};

export function ServicioCard({ servicio }: { servicio: Servicio }) {
  const [editando, setEditando] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [state, action, pending] = useActionState(updateServicio, init);
  const [delState, delAction, delPending] = useActionState(deleteServicio, init);

  if (editando) {
    return (
      <form action={action} className="space-y-2 rounded-lg border p-4">
        <input type="hidden" name="id" value={servicio.id} />
        <div className="space-y-1">
          <Label className="text-xs">Nombre</Label>
          <Input name="nombre" defaultValue={servicio.nombre} required className="h-8 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">¿Genera saldo?</Label>
            <select name="categoria_saldo" defaultValue={servicio.categoria_saldo ?? ""} className={SELECT}>
              <option value="">Informativo</option>
              <option value="academia">Academia</option>
              <option value="paquete">Paquete</option>
              <option value="particular">Clase particular</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Orden</Label>
            <Input name="orden" type="number" defaultValue={String(servicio.orden)} className="h-8 text-sm" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Color</Label>
            <input type="color" name="color" defaultValue={servicio.color ?? "#8aa0a8"} className="h-8 w-full rounded-md border" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Estado</Label>
            <select name="activo" defaultValue={servicio.activo ? "true" : "false"} className={SELECT}>
              <option value="true">Activo</option>
              <option value="false">Inactivo</option>
            </select>
          </div>
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
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-semibold">
          <span className="size-3 shrink-0 rounded-sm" style={{ backgroundColor: servicio.color ?? "#8aa0a8" }} />
          {servicio.nombre}
        </span>
        {servicio.categoria_saldo ? (
          <Badge variant="secondary">{CAT_LABEL[servicio.categoria_saldo]}</Badge>
        ) : (
          <Badge variant="outline">Informativo</Badge>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {!servicio.activo && <Badge variant="outline">Inactivo</Badge>}
        {!confirmDel && (
          <>
            <Button type="button" size="sm" variant="outline" onClick={() => setEditando(true)}>Editar</Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirmDel(true)}
            >
              Eliminar
            </Button>
          </>
        )}
        {confirmDel && (
          <form action={delAction} className="flex items-center gap-2">
            <input type="hidden" name="id" value={servicio.id} />
            <span className="text-muted-foreground text-xs">¿Eliminar?</span>
            <Button type="submit" size="sm" variant="destructive" disabled={delPending}>
              {delPending ? "Eliminando…" : "Sí"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDel(false)}>
              Cancelar
            </Button>
          </form>
        )}
      </div>
      {confirmDel && delState.error && <p className="text-destructive mt-2 text-xs">{delState.error}</p>}
    </div>
  );
}
