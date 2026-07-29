"use client";

import { useActionState, useState } from "react";
import { crearEvento, type EventoState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const init: EventoState = {};
const SELECT = "border-input bg-background h-9 w-full rounded-md border px-3 text-sm";

export function EventoForm({
  servicios,
  profesores,
}: {
  servicios: { id: number; nombre: string }[];
  profesores: { id: string; nombre: string | null }[];
}) {
  const [state, action, pending] = useActionState(crearEvento, init);
  const [profRows, setProfRows] = useState<number[]>([]);
  const [nextKey, setNextKey] = useState(0);
  const addRow = () => {
    setProfRows((r) => [...r, nextKey]);
    setNextKey((k) => k + 1);
  };
  const removeRow = (k: number) => setProfRows((r) => r.filter((x) => x !== k));
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="nombre">Nombre</Label>
        <Input id="nombre" name="nombre" required placeholder="Torneo de verano, Masterclass…" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="tipo">Tipo</Label>
          <select id="tipo" name="tipo" defaultValue="torneo" className={SELECT}>
            <option value="torneo">Torneo</option>
            <option value="clinica">Clínica</option>
            <option value="masterclass">Masterclass</option>
            <option value="otro">Otro</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="deporte">Deporte</Label>
          <select id="deporte" name="deporte" defaultValue="" className={SELECT}>
            <option value="">— N/A —</option>
            <option value="tenis">Tenis</option>
            <option value="padel">Pádel</option>
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="servicio_id">Servicio (para el ingreso)</Label>
        <select id="servicio_id" name="servicio_id" defaultValue="" className={SELECT}>
          <option value="">— Sin servicio —</option>
          {servicios.map((s) => (
            <option key={s.id} value={s.id}>{s.nombre}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="fecha_inicio">Fecha inicio</Label>
          <Input id="fecha_inicio" name="fecha_inicio" type="date" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fecha_fin">Fecha fin</Label>
          <Input id="fecha_fin" name="fecha_fin" type="date" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="hora_inicio">Hora</Label>
          <Input id="hora_inicio" name="hora_inicio" type="time" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cupo">Cupo</Label>
          <Input id="cupo" name="cupo" type="number" min={0} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="lugar">Lugar</Label>
          <Input id="lugar" name="lugar" placeholder="Cancha central…" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="precio_inscripcion">Precio inscripción (COP)</Label>
          <Input id="precio_inscripcion" name="precio_inscripcion" type="number" min={0} defaultValue={0} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notas">Notas</Label>
        <Input id="notas" name="notas" />
      </div>

      {profesores.length > 0 && (
        <div className="space-y-2 border-t pt-4">
          <Label>Profesores responsables (opcional)</Label>
          {profRows.map((k) => (
            <div key={k} className="flex items-center gap-2">
              <select name="prof_id" defaultValue="" className={`${SELECT} flex-1`}>
                <option value="">Profesor…</option>
                {profesores.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre ?? p.id}</option>
                ))}
              </select>
              <Input name="prof_pago" type="number" min={0} placeholder="Pago (COP)" className="w-32" />
              <Button type="button" size="sm" variant="ghost" onClick={() => removeRow(k)} aria-label="Quitar">
                ×
              </Button>
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" onClick={addRow}>
            + Agregar profesor
          </Button>
          <p className="text-muted-foreground text-xs">
            El pago de cada profesor entra a su Liquidación del periodo como “Evento”. Puedes editarlo luego en la ficha.
          </p>
        </div>
      )}

      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      <Button type="submit" disabled={pending}>{pending ? "Creando…" : "Crear evento"}</Button>
    </form>
  );
}
