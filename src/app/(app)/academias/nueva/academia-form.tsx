"use client";

import { useActionState } from "react";
import { createAcademia, type AcademiaFormState } from "../actions";
import { CATEGORIAS } from "@/lib/validations/academia";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: AcademiaFormState = {};
const SELECT = "border-input bg-background h-9 w-full rounded-md border px-3 text-sm";

/**
 * La academia es un SERVICIO, no un grupo: por eso ya no se le pide horario,
 * profesor ni cancha (eso baja al horario de cada inscrito), ni nivel (baja al
 * niño). El precio queda solo como referencia; el ingreso sale de Siigo.
 */
export function AcademiaForm({
  servicios,
}: {
  servicios: { id: number; nombre: string }[];
}) {
  const [state, action, pending] = useActionState(createAcademia, initial);
  const fe = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="nombre">Nombre</Label>
        <Input id="nombre" name="nombre" required placeholder="Academia Recreativa Tenis" />
        {fe.nombre && <p className="text-destructive text-sm">{fe.nombre}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="deporte">Deporte</Label>
          <select id="deporte" name="deporte" className={SELECT}>
            <option value="tenis">Tenis</option>
            <option value="padel">Pádel</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="categoria">Categoría</Label>
          <select id="categoria" name="categoria" className={SELECT}>
            {CATEGORIAS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          {fe.categoria && <p className="text-destructive text-sm">{fe.categoria}</p>}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="servicioId">Servicio en Siigo</Label>
        <select id="servicioId" name="servicioId" className={SELECT}>
          <option value="">— Sin atar —</option>
          {servicios.map((s) => (
            <option key={s.id} value={s.id}>{s.nombre}</option>
          ))}
        </select>
        <p className="text-muted-foreground text-xs">
          Con qué grupo de producto se factura en Siigo. De ahí sale el ingreso de la academia.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="precio">Precio de referencia (COP)</Label>
          <Input id="precio" name="precio" type="number" min={0} defaultValue={0} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="matricula">Matrícula de referencia (COP)</Label>
          <Input id="matricula" name="matricula" type="number" min={0} defaultValue={0} />
        </div>
      </div>
      <p className="text-muted-foreground text-xs">
        Estos dos valores son solo informativos, para consulta. La plata que se cobra sale de las
        facturas de Siigo, no de aquí.
      </p>

      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Creando…" : "Crear academia"}
      </Button>
    </form>
  );
}
