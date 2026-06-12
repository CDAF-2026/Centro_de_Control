"use client";

import { useActionState, useState } from "react";
import { createCatalogo, type PaqueteFormState } from "./actions";
import { precioFinal } from "@/lib/validations/paquete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: PaqueteFormState = {};
const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

export function CatalogoForm() {
  const [state, action, pending] = useActionState(createCatalogo, initial);
  const fe = state.fieldErrors ?? {};
  const [precio, setPrecio] = useState(0);
  const [descuento, setDescuento] = useState(0);

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="nombre">Nombre</Label>
        <Input id="nombre" name="nombre" placeholder="Bono 8 clases" required />
        {fe.nombre && <p className="text-destructive text-sm">{fe.nombre}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="numClases">N.º clases</Label>
          <Input id="numClases" name="numClases" type="number" min={1} required />
          {fe.numClases && <p className="text-destructive text-sm">{fe.numClases}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="deporte">Deporte</Label>
          <select id="deporte" name="deporte" className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm">
            <option value="">Ambos</option>
            <option value="tenis">Tenis</option>
            <option value="padel">Pádel</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="precio">Precio total (COP)</Label>
          <Input id="precio" name="precio" type="number" min={0} value={precio} onChange={(e) => setPrecio(Number(e.target.value) || 0)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="descuento">Descuento %</Label>
          <Input id="descuento" name="descuento" type="number" min={0} max={100} value={descuento} onChange={(e) => setDescuento(Number(e.target.value) || 0)} />
        </div>
      </div>
      <p className="text-sm">
        Precio final: <strong>{COP.format(precioFinal(precio, descuento))}</strong>
        {descuento > 0 && <span className="text-muted-foreground"> ({descuento}% de descuento)</span>}
      </p>
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      {state.ok && <p className="text-primary text-sm">{state.ok}</p>}
      <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Agregar paquete"}</Button>
    </form>
  );
}
