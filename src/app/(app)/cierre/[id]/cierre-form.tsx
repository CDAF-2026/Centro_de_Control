"use client";

import { useActionState } from "react";
import { cerrarClase, type CierreState } from "../actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const SELECT = "border-input bg-background h-9 rounded-md border px-2 text-sm";
const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

export function CierreForm({
  claseId,
  estadoActual,
  deportistas,
  estadoPorCliente,
  esAcademia,
  noRegistrados,
  numAsistentes,
  valorFacturado,
}: {
  claseId: number;
  estadoActual: string;
  deportistas: { id: number; nombre: string }[];
  estadoPorCliente: Record<number, string>;
  esAcademia: boolean;
  noRegistrados: string;
  numAsistentes: number;
  valorFacturado: number | null;
}) {
  const [state, action, pending] = useActionState<CierreState, FormData>(cerrarClase, {});

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="claseId" value={claseId} />

      {valorFacturado != null && (
        <div className="bg-muted/40 flex items-center justify-between gap-3 rounded-md border px-3 py-2.5">
          <span className="text-sm font-medium">Valor de la clase (se factura)</span>
          <span className="text-lg font-semibold tabular-nums">{COP.format(valorFacturado)}</span>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="estado">¿La clase se dictó?</Label>
        <select
          id="estado"
          name="estado"
          defaultValue={estadoActual === "programada" ? "realizada" : estadoActual}
          className="border-input bg-background h-11 w-full rounded-md border px-3 text-base"
        >
          <option value="realizada">Sí, se dictó (realizada)</option>
          <option value="cancelada">Cancelada</option>
          <option value="no_show">No-show (no asistió)</option>
        </select>
      </div>

      {deportistas.length > 0 && (
        <div className="space-y-2">
          <Label>Asistencia{esAcademia ? " de los alumnos" : ""}</Label>
          {deportistas.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
              <span className="text-sm">{d.nombre}</span>
              <input type="hidden" name="deportista" value={d.id} />
              <select name={`asis_${d.id}`} defaultValue={estadoPorCliente[d.id] ?? "presente"} className={SELECT}>
                <option value="presente">Presente</option>
                <option value="excusa_medica">Falta con excusa médica</option>
                <option value="ausente">Falta (sin excusa)</option>
              </select>
            </div>
          ))}
        </div>
      )}

      {!esAcademia && (
        <div className="space-y-1.5">
          <Label htmlFor="num_asistentes">¿Cuántas personas tomaron la clase?</Label>
          <select
            id="num_asistentes"
            name="num_asistentes"
            defaultValue={String(Math.max(1, numAsistentes))}
            className="border-input bg-background h-11 w-full rounded-md border px-3 text-base"
          >
            <option value="1">1 persona</option>
            <option value="2">2 personas</option>
            <option value="3">3 personas</option>
            <option value="4">4 personas</option>
            <option value="5">5 personas</option>
            <option value="6">6 personas</option>
          </select>
          <p className="text-muted-foreground text-xs">
            Para clases compartidas. Define el valor cuando el profesor cobra por nº de personas.
          </p>
        </div>
      )}

      {esAcademia && (
        <div className="space-y-1.5">
          <Label htmlFor="no_reg">Asistentes no inscritos (opcional)</Label>
          <textarea
            id="no_reg"
            name="asistentes_no_registrados"
            defaultValue={noRegistrados}
            rows={2}
            placeholder="Quienes asistieron sin estar inscritos (para controlar clases extra)…"
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>
      )}

      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      {state.ok && <p className="text-primary text-sm">{state.ok}</p>}

      <Button type="submit" className="h-11 w-full text-base" disabled={pending}>
        {pending ? "Guardando…" : "Registrar clase"}
      </Button>
    </form>
  );
}
