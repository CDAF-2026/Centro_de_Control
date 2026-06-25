"use client";

import { useActionState, useState } from "react";
import { updateCatalogo, deleteCatalogo, type PaqueteFormState } from "./actions";
import { precioFinal } from "@/lib/validations/paquete";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const init: PaqueteFormState = {};

export type PaqueteCatalogo = {
  id: number;
  nombre: string;
  deporte: "tenis" | "padel" | null;
  num_clases: number;
  precio: number;
  descuento_pct: number;
  activo: boolean;
};

const SELECT = "border-input bg-background h-8 w-full rounded-md border px-2 text-sm";

export function CatalogoCard({ paquete, puedeConfig }: { paquete: PaqueteCatalogo; puedeConfig: boolean }) {
  const [editando, setEditando] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [state, action, pending] = useActionState(updateCatalogo, init);
  const [delState, delAction, delPending] = useActionState(deleteCatalogo, init);
  const [precio, setPrecio] = useState(String(paquete.precio));
  const [descuento, setDescuento] = useState(String(paquete.descuento_pct));
  const fe = state.fieldErrors ?? {};

  if (puedeConfig && editando) {
    return (
      <form action={action} className="space-y-2 rounded-lg border p-4">
        <input type="hidden" name="id" value={paquete.id} />
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
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Precio total</Label>
            <Input name="precio" type="number" min={0} value={precio} onChange={(e) => setPrecio(e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Descuento %</Label>
            <Input name="descuento" type="number" min={0} max={100} value={descuento} onChange={(e) => setDescuento(e.target.value)} className="h-8 text-sm" />
          </div>
        </div>
        <p className="text-sm">Precio final: <strong>{COP.format(precioFinal(Number(precio) || 0, Number(descuento) || 0))}</strong></p>
        <div className="space-y-1">
          <Label className="text-xs">Estado</Label>
          <select name="activo" defaultValue={paquete.activo ? "true" : "false"} className={SELECT}>
            <option value="true">Activo</option>
            <option value="false">Inactivo</option>
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

  const final = precioFinal(paquete.precio, paquete.descuento_pct);

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <span className="font-semibold">{paquete.nombre}</span>
        {paquete.deporte && <Badge variant="outline">{paquete.deporte}</Badge>}
      </div>
      <p className="mt-1 text-2xl font-semibold">
        {paquete.num_clases} <span className="text-muted-foreground text-sm">clases</span>
      </p>
      {paquete.descuento_pct > 0 ? (
        <p className="text-sm">
          <span className="text-muted-foreground line-through">{COP.format(paquete.precio)}</span>{" "}
          <span className="font-medium">{COP.format(final)}</span>{" "}
          <Badge variant="secondary">-{paquete.descuento_pct}%</Badge>
        </p>
      ) : (
        <p className="text-muted-foreground text-sm">{COP.format(paquete.precio)}</p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {!paquete.activo && <Badge variant="outline">Inactivo</Badge>}
        {puedeConfig && !confirmDel && (
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
        {puedeConfig && confirmDel && (
          <form action={delAction} className="flex items-center gap-2">
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
      </div>
      {confirmDel && delState.error && <p className="text-destructive mt-2 text-xs">{delState.error}</p>}
    </div>
  );
}
