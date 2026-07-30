"use client";

import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";

export type Profesor = { id: string; nombre: string | null };

const SELECT = "border-input bg-background h-9 w-full rounded-md border px-2 text-sm";

/**
 * Las columnas van en un solo lugar para que la cabecera y las filas cuadren.
 * La fila en línea arranca en `md` y no en `sm`: los seis campos suman ~600px y
 * en una pantalla de 640 se desbordarían. Debajo de eso se apilan en dos columnas.
 */
const COLS =
  "grid-cols-2 gap-x-2 gap-y-3 md:grid-cols-[5.5rem_8rem_8.5rem_minmax(8rem,1fr)_4rem_1.75rem] md:gap-y-0";

/** Títulos de columna: se muestran UNA vez, no repetidos en cada fila. */
export function HorarioCabecera() {
  return (
    <div className={`text-muted-foreground hidden px-2 text-xs ${COLS} md:grid`}>
      <span>Día</span>
      <span>Hora</span>
      <span>Duración</span>
      <span>Profesor</span>
      <span>Cancha</span>
      <span className="sr-only">Quitar</span>
    </div>
  );
}

/** En pantalla angosta cada campo lleva su propia etiqueta; en ancha la trae la cabecera. */
function Campo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs">
      <span className="text-muted-foreground mb-1 block md:hidden">{label}</span>
      {children}
    </label>
  );
}

/**
 * Una venida a la semana: día + hora + duración + profesor + cancha.
 * Los campos van como arreglos paralelos (`h_dia`, `h_hora`, …) para que el
 * servidor los lea con `formData.getAll` fila por fila.
 */
export function HorarioFila({
  profesores,
  dias,
  duraciones,
  onQuitar,
  autoFocus = false,
  defaults,
}: {
  profesores: Profesor[];
  dias: readonly { value: number; label: string }[];
  duraciones: readonly { value: number; label: string }[];
  onQuitar?: () => void;
  autoFocus?: boolean;
  defaults?: { dia?: number; hora?: string; dur?: number; profesorId?: string; cancha?: string };
}) {
  return (
    <div className={`bg-muted/30 grid rounded-md border p-2 ${COLS} md:items-center`}>
      <Campo label="Día">
        <select name="h_dia" defaultValue={defaults?.dia ?? 1} className={SELECT} autoFocus={autoFocus}>
          {dias.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
      </Campo>

      <Campo label="Hora">
        <Input name="h_hora" type="time" defaultValue={defaults?.hora ?? ""} />
      </Campo>

      <Campo label="Duración">
        <select name="h_dur" defaultValue={defaults?.dur ?? 60} className={SELECT}>
          {duraciones.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
      </Campo>

      <Campo label="Profesor">
        <select name="h_profesor" defaultValue={defaults?.profesorId ?? ""} className={SELECT}>
          <option value="">— Sin asignar —</option>
          {profesores.map((p) => <option key={p.id} value={p.id}>{p.nombre ?? p.id}</option>)}
        </select>
      </Campo>

      <Campo label="Cancha">
        <Input name="h_cancha" defaultValue={defaults?.cancha ?? ""} placeholder="3" />
      </Campo>

      <div className="col-span-2 flex justify-end md:col-span-1 md:justify-center">
        {onQuitar && (
          <button
            type="button"
            onClick={onQuitar}
            className="text-muted-foreground hover:text-destructive size-7 rounded text-sm"
            aria-label="Quitar este día"
            title="Quitar este día"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
