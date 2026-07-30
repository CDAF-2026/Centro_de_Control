"use client";

import { useActionState, useState, useTransition } from "react";
import { agregarHorario, quitarHorario, quitarInscripcion, type AcademiaFormState } from "../actions";
import { DIAS, DURACIONES } from "@/lib/validations/academia";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HorarioFila, HorarioCabecera, type Profesor } from "./horario-fila";

const initial: AcademiaFormState = {};
const DIA_LABEL = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const hhmm = (t: string) => t.slice(0, 5);

export type InscritoHorario = {
  id: number;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  profesorNombre: string | null;
  cancha: string | null;
};

export type Inscrito = {
  inscripcionId: number;
  nombre: string;
  nivel: string | null;
  descuento: number;
  horarios: InscritoHorario[];
  presentesMes: number;
};

/**
 * Un inscrito con sus horarios. El "grupo" no se muestra en ninguna parte: lo
 * que se ve es cuándo viene cada niño, con quién y dónde.
 */
export function InscritoRow({
  academiaId,
  inscrito,
  profesores,
  puedeEditar,
}: {
  academiaId: number;
  inscrito: Inscrito;
  profesores: Profesor[];
  puedeEditar: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [state, action, pending] = useActionState(agregarHorario, initial);
  const [borrando, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  // La frecuencia no se declara, se cuenta: 3 horarios = viene 3 veces por semana.
  const porSemana = inscrito.horarios.length;
  const sobre = inscrito.presentesMes > porSemana * 4 && porSemana > 0;

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {inscrito.nombre}
            {inscrito.nivel && <Badge variant="secondary">{inscrito.nivel}</Badge>}
            {sobre && <Badge variant="warning">Sobre-asistencia · {inscrito.presentesMes} este mes</Badge>}
          </p>
          <p className="text-muted-foreground text-xs">
            {porSemana}×sem
            {inscrito.descuento > 0 && ` · ${inscrito.descuento}% desc.`}
          </p>
        </div>
        {puedeEditar && (
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setAbierto((v) => !v)}>
              {abierto ? "Listo" : "Editar horarios"}
            </Button>
            <button
              type="button"
              className="text-muted-foreground hover:text-destructive text-xs underline"
              disabled={borrando}
              onClick={() => {
                setErr(null);
                start(async () => {
                  const r = await quitarInscripcion(inscrito.inscripcionId, academiaId);
                  if (r.error) setErr(r.error);
                });
              }}
            >
              Retirar
            </button>
          </div>
        )}
      </div>

      <ul className="mt-2 space-y-1">
        {inscrito.horarios.length === 0 ? (
          <li className="text-muted-foreground text-xs">Sin horarios. Agrégale al menos un día.</li>
        ) : (
          inscrito.horarios.map((h) => (
            <li key={h.id} className="flex items-center gap-2 text-xs">
              <span className="tabular-nums">
                <strong>{DIA_LABEL[h.dia_semana]}</strong> {hhmm(h.hora_inicio)}–{hhmm(h.hora_fin)}
              </span>
              <span className="text-muted-foreground">
                {h.profesorNombre ?? "sin profesor"}
                {h.cancha && ` · cancha ${h.cancha}`}
              </span>
              {abierto && puedeEditar && (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Quitar este día"
                  disabled={borrando}
                  onClick={() => {
                    setErr(null);
                    start(async () => {
                      const r = await quitarHorario(h.id, academiaId);
                      if (r.error) setErr(r.error);
                    });
                  }}
                >
                  ✕
                </button>
              )}
            </li>
          ))
        )}
      </ul>

      {abierto && puedeEditar && (
        <form action={action} className="mt-3 space-y-1.5">
          <input type="hidden" name="inscripcionId" value={inscrito.inscripcionId} />
          <input type="hidden" name="academiaId" value={academiaId} />
          <HorarioCabecera />
          <HorarioFila profesores={profesores} dias={DIAS} duraciones={DURACIONES} />
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Agregando…" : "Agregar día"}
            </Button>
            {state.error && <p className="text-destructive text-xs">{state.error}</p>}
          </div>
        </form>
      )}

      {err && <p className="text-destructive mt-1 text-xs">{err}</p>}
    </li>
  );
}
