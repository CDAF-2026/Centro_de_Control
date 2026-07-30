"use client";

import { useActionState, useState } from "react";
import { cerrarClase, type CierreState } from "../actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const SELECT = "border-input bg-background h-9 rounded-md border px-2 text-sm";
const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

type Alumno = { id: number; nombre: string };

export function CierreForm({
  claseId,
  estadoActual,
  deportistas,
  otrosInscritos = [],
  estadoPorCliente,
  esAcademia,
  noRegistrados,
  numAsistentes,
  valorFacturado,
}: {
  claseId: number;
  estadoActual: string;
  /** Los que tienen ESTE día a ESTA hora en su horario. */
  deportistas: Alumno[];
  /** El resto de inscritos de la academia: solo para registrar una reposición. */
  otrosInscritos?: Alumno[];
  estadoPorCliente: Record<number, string>;
  esAcademia: boolean;
  noRegistrados: string;
  numAsistentes: number;
  valorFacturado: number | null;
}) {
  const [state, action, pending] = useActionState<CierreState, FormData>(cerrarClase, {});
  // Estado de cada alumno, para poder mostrar el conteo antes de guardar.
  const [estados, setEstados] = useState<Record<number, string>>(() => {
    const inicial: Record<number, string> = {};
    for (const d of deportistas) inicial[d.id] = estadoPorCliente[d.id] ?? "presente";
    for (const o of otrosInscritos) inicial[o.id] = estadoPorCliente[o.id] ?? "no";
    return inicial;
  });
  const [verOtros, setVerOtros] = useState(deportistas.length === 0 && otrosInscritos.length > 0);

  const presentes = deportistas.filter((d) => estados[d.id] === "presente").length;
  const reposiciones = otrosInscritos.filter((o) => estados[o.id] && estados[o.id] !== "no").length;

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
          {esAcademia && (
            <p className="text-muted-foreground text-xs">
              Solo los inscritos que tienen esta franja en su horario.
            </p>
          )}
          {deportistas.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
              <span className="text-sm">{d.nombre}</span>
              <input type="hidden" name="deportista" value={d.id} />
              <select
                name={`asis_${d.id}`}
                value={estados[d.id] ?? "presente"}
                onChange={(e) => setEstados((s) => ({ ...s, [d.id]: e.target.value }))}
                className={SELECT}
              >
                <option value="presente">Presente</option>
                <option value="excusa_medica">Falta con excusa médica</option>
                <option value="ausente">Falta (sin excusa)</option>
              </select>
            </div>
          ))}
          {/* Conteo explícito antes de guardar: un olvido tiene que saltar a la vista,
              porque en academia se cobra por sesión asistida. */}
          <p className="bg-muted/40 rounded-md border px-3 py-2 text-sm">
            Vas a registrar <strong>{presentes}</strong>{" "}
            {presentes === 1 ? "presente" : "presentes"} de{" "}
            <strong>{deportistas.length}</strong> que se esperaban
            {reposiciones > 0 && <> · más {reposiciones} de reposición</>}.
          </p>
        </div>
      )}

      {esAcademia && deportistas.length === 0 && (
        <p className="border-destructive/40 bg-destructive/10 rounded-md border px-3 py-2 text-sm">
          Ningún inscrito tiene esta academia este día a esta hora en su horario. Revisa el horario de
          los niños en la ficha de la academia, o marca abajo a quien haya venido.
        </p>
      )}

      {/* Reposiciones: el que vino un día que no es el suyo. Va aparte y cerrado,
          para que la lista principal siga siendo solo la gente de la franja. */}
      {esAcademia && otrosInscritos.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setVerOtros((v) => !v)}
            className="text-muted-foreground hover:text-foreground text-sm underline"
          >
            {verOtros ? "Ocultar" : `¿Vino alguien más de la academia? (${otrosInscritos.length})`}
          </button>
          {verOtros && (
            <>
              <p className="text-muted-foreground text-xs">
                Inscritos de esta academia que NO tienen esta franja. Déjalos en &ldquo;No vino&rdquo;
                salvo que hayan venido de reposición.
              </p>
              {otrosInscritos.map((o) => (
                <div key={o.id} className="flex items-center justify-between gap-3 rounded-md border border-dashed p-3">
                  <span className="text-muted-foreground text-sm">{o.nombre}</span>
                  <input type="hidden" name="deportista" value={o.id} />
                  <select
                    name={`asis_${o.id}`}
                    value={estados[o.id] ?? "no"}
                    onChange={(e) => setEstados((s) => ({ ...s, [o.id]: e.target.value }))}
                    className={SELECT}
                  >
                    <option value="no">No vino</option>
                    <option value="reposicion">Vino de reposición</option>
                  </select>
                </div>
              ))}
            </>
          )}
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
