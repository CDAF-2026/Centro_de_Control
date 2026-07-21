"use client";

import { useActionState, useState } from "react";
import { agregarHermano, quitarHermano, type ClienteFormState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, X } from "lucide-react";

const initial: ClienteFormState = {};

export type Miembro = {
  id: number;
  nombres: string;
  apellidos: string;
  fecha_nacimiento: string | null;
  deportes: string[];
  es_titular: boolean;
};

function edad(fn: string | null): number | null {
  if (!fn) return null;
  const d = new Date(`${fn}T00:00:00`);
  const h = new Date();
  let e = h.getFullYear() - d.getFullYear();
  if (h.getMonth() < d.getMonth() || (h.getMonth() === d.getMonth() && h.getDate() < d.getDate())) e--;
  return e;
}
const depLabel = (d: string) => (d === "tenis" ? "Tenis" : "Pádel");

export function Hermanos({
  clienteId,
  miembros,
  puedeEditar,
}: {
  clienteId: number;
  miembros: Miembro[];
  puedeEditar: boolean;
}) {
  const [state, action, pending] = useActionState(agregarHermano, initial);
  const [abierto, setAbierto] = useState(false);
  const fe = state.fieldErrors ?? {};

  return (
    <div className="space-y-3">
      <ul className="divide-y">
        {miembros.map((m) => {
          const e = edad(m.fecha_nacimiento);
          return (
            <li key={m.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-medium">
                  {m.nombres} {m.apellidos}
                  {m.es_titular && <Badge variant="secondary">Titular</Badge>}
                </p>
                <p className="text-muted-foreground text-xs">
                  {e != null ? `${e} años` : "Sin fecha de nacimiento"}
                  {m.deportes.length > 0 && ` · ${m.deportes.map(depLabel).join(" · ")}`}
                </p>
              </div>
              {puedeEditar && !m.es_titular && (
                <form action={quitarHermano}>
                  <input type="hidden" name="miembroId" value={m.id} />
                  <input type="hidden" name="clienteId" value={clienteId} />
                  <Button type="submit" variant="ghost" size="icon-sm" title="Quitar hermano">
                    <X className="size-4" />
                  </Button>
                </form>
              )}
            </li>
          );
        })}
      </ul>

      {puedeEditar &&
        (abierto ? (
          <form action={action} className="bg-muted/30 space-y-3 rounded-lg border p-4">
            <input type="hidden" name="clienteId" value={clienteId} />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="h-nombres">Nombres</Label>
                <Input id="h-nombres" name="nombres" required />
                {fe.nombres && <p className="text-destructive text-xs">{fe.nombres}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="h-apellidos">Apellidos</Label>
                <Input id="h-apellidos" name="apellidos" required />
                {fe.apellidos && <p className="text-destructive text-xs">{fe.apellidos}</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="h-fecha">Fecha de nacimiento</Label>
                <Input id="h-fecha" name="fechaNacimiento" type="date" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="h-doc">Documento</Label>
                <Input id="h-doc" name="documento" />
              </div>
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" name="deportes" value="tenis" className="size-4" /> Tenis
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="deportes" value="padel" className="size-4" /> Pádel
              </label>
            </div>
            {state.error && <p className="text-destructive text-sm">{state.error}</p>}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pending}>{pending ? "Guardando…" : "Guardar hermano"}</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button>
            </div>
          </form>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={() => setAbierto(true)}>
            <Plus className="size-4" /> Agregar hermano
          </Button>
        ))}
    </div>
  );
}
