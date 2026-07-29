"use client";

import { Input } from "@/components/ui/input";

export type Profesor = { id: string; nombre: string | null };

const SELECT = "border-input bg-background h-9 rounded-md border px-2 text-sm";

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
    <div className="bg-muted/30 flex flex-wrap items-end gap-2 rounded-md border p-2">
      <label className="text-muted-foreground text-xs">
        Día
        <select name="h_dia" defaultValue={defaults?.dia ?? 1} className={`${SELECT} mt-1 block`} autoFocus={autoFocus}>
          {dias.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
      </label>

      <label className="text-muted-foreground text-xs">
        Hora
        <Input name="h_hora" type="time" defaultValue={defaults?.hora ?? ""} className="mt-1 w-[7.5rem]" />
      </label>

      <label className="text-muted-foreground text-xs">
        Duración
        <select name="h_dur" defaultValue={defaults?.dur ?? 60} className={`${SELECT} mt-1 block`}>
          {duraciones.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
      </label>

      <label className="text-muted-foreground text-xs">
        Profesor
        <select name="h_profesor" defaultValue={defaults?.profesorId ?? ""} className={`${SELECT} mt-1 block`}>
          <option value="">— Sin asignar —</option>
          {profesores.map((p) => <option key={p.id} value={p.id}>{p.nombre ?? p.id}</option>)}
        </select>
      </label>

      <label className="text-muted-foreground text-xs">
        Cancha
        <Input name="h_cancha" defaultValue={defaults?.cancha ?? ""} placeholder="3" className="mt-1 w-16" />
      </label>

      {onQuitar && (
        <button
          type="button"
          onClick={onQuitar}
          className="text-muted-foreground hover:text-destructive h-9 px-2 text-sm"
          aria-label="Quitar este día"
        >
          ✕
        </button>
      )}
    </div>
  );
}
