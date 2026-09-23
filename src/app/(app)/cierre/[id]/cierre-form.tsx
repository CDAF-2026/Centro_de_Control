"use client";

import { useActionState, useState } from "react";
import { cerrarClase, type CierreState } from "../actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

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
  colegio = null,
  noRegistrados,
  numAsistentes,
  valorFacturado,
}: {
  claseId: number;
  estadoActual: string;
  /** Los apuntados a ESTA clase del planeador. */
  deportistas: Alumno[];
  /** El resto de matriculados en la academia: solo para una reposición. */
  otrosInscritos?: Alumno[];
  estadoPorCliente: Record<number, string>;
  esAcademia: boolean;
  /** Clase de colegio: no lleva lista de niños, solo se dice si se dictó. */
  colegio?: string | null;
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
  // "No se dictó" saca la clase de la cola para siempre, así que tiene que decir
  // POR QUÉ: un receso sin cargar y un olvido se ven iguales y se arreglan
  // distinto (uno está bien, el otro hay que reponerlo).
  const [estadoClase, setEstadoClase] = useState(
    estadoActual === "programada" ? "realizada" : estadoActual,
  );
  const noSeDicto = estadoClase === "cancelada";

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
          value={estadoClase}
          onChange={(e) => setEstadoClase(e.target.value)}
          className="border-input bg-background h-11 w-full rounded-md border px-3 text-base"
        >
          <option value="realizada">Sí, se dictó</option>
          <option value="cancelada">No se dictó este día</option>
          {/* "No-show" es de la clase particular: el cliente no llegó. En academia
              eso no existe — si no vino nadie, la clase no se dictó. */}
          {!esAcademia && <option value="no_show">No-show (no asistió)</option>}
        </select>
      </div>

      {noSeDicto && (
        <div className="border-warning/35 bg-warning/10 space-y-2 rounded-md border px-3 py-3">
          <Label htmlFor="motivo_cancelacion">¿Por qué no se dictó?</Label>
          <Input
            id="motivo_cancelacion"
            name="motivo_cancelacion"
            required
            minLength={3}
            placeholder="Semana de receso · profesor enfermo · lluvia · cancha ocupada"
          />
          <p className="text-muted-foreground text-xs">
            La clase deja de pedirse y no cuenta para nada. Queda el registro de que ese día no
            hubo, con el motivo.
          </p>
        </div>
      )}

      {deportistas.length > 0 && !noSeDicto && (
        <div className="space-y-2">
          <Label>Asistencia{esAcademia ? " de los alumnos" : ""}</Label>
          {esAcademia && (
            <p className="text-muted-foreground text-xs">
              Solo los que están apuntados a esta clase.
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
                <option value="presente">Asistió</option>
                <option value="ausente">No asistió</option>
                <option value="excusa_medica">No asistió con excusa médica</option>
              </select>
            </div>
          ))}
          {/* Conteo explícito antes de guardar: un olvido tiene que saltar a la vista,
              porque en academia se cobra por sesión asistida. */}
          <p className="bg-muted/40 rounded-md border px-3 py-2 text-sm">
            Vas a registrar que <strong>{presentes}</strong>{" "}
            {presentes === 1 ? "asistió" : "asistieron"} de{" "}
            <strong>{deportistas.length}</strong> que se esperaban
            {reposiciones > 0 && <> · más {reposiciones} de reposición</>}.
          </p>
        </div>
      )}

      {colegio && !noSeDicto && (
        <p className="bg-muted rounded-md px-3 py-2 text-sm">
          Es la clase del colegio <strong>{colegio}</strong>: no lleva lista de niños. Solo di si se
          dictó.
        </p>
      )}

      {esAcademia && !colegio && deportistas.length === 0 && !noSeDicto && (
        <p className="border-destructive/40 bg-destructive/10 rounded-md border px-3 py-2 text-sm">
          Esta clase no tiene a nadie apuntado. Si se registró sin decir de qué clase del
          planeador salía, revísalo en Academias; mientras tanto, marca abajo a quien haya venido.
        </p>
      )}

      {/* Reposiciones: el que vino un día que no es el suyo. Va aparte y cerrado,
          para que la lista principal siga siendo solo la gente de esta clase. */}
      {esAcademia && otrosInscritos.length > 0 && !noSeDicto && (
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
                Matriculados en esta academia que NO vienen a esta clase. Déjalos en
                &ldquo;No vino&rdquo; salvo que hayan venido de reposición.
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

      {!esAcademia && !noSeDicto && (
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

      {esAcademia && !colegio && (
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
