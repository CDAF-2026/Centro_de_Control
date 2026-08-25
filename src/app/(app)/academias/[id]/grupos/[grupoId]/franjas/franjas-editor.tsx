"use client";

import { useActionState, useState, useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { guardarFranja, eliminarFranja, type AcademiaFormState } from "../../../../actions";
import { DIAS, DURACIONES } from "@/lib/validations/academia";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DIA_CORTO, hhmm } from "../../../../ocupacion";

const SELECT = "border-input bg-background h-9 w-full rounded-md border px-2 text-sm";

export type FranjaEdit = {
  id: number;
  dia: number;
  horaInicio: string;
  horaFin: string;
  profesorId: string | null;
  cancha: string | null;
  cupo: number | null;
  inscritos: number;
};

/** Minutos entre dos "HH:MM(:SS)". Sirve para preseleccionar la duración al editar. */
function duracionDe(inicio: string, fin: string): number {
  const min = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  return min(fin) - min(inicio);
}

export function FranjasEditor({
  academiaId,
  grupoId,
  franjas,
  profesores,
  cupoNivel,
}: {
  academiaId: number;
  grupoId: number;
  franjas: FranjaEdit[];
  profesores: { id: string; nombre: string | null }[];
  cupoNivel: number;
}) {
  const [state, action, pending] = useActionState<AcademiaFormState, FormData>(guardarFranja, {});
  const [editando, setEditando] = useState<FranjaEdit | null>(null);
  const [borrando, setBorrando] = useState<number | null>(null);
  const [errBorrar, setErrBorrar] = useState<string | null>(null);
  const [okBorrar, setOkBorrar] = useState<string | null>(null);
  const [borrandoPending, startBorrar] = useTransition();

  // Remontar el formulario al cambiar de franja: si no, los defaultValue se
  // quedan con los de la anterior.
  const formKey = editando ? `edit-${editando.id}` : "nueva";

  return (
    <div className="space-y-6">
      <div className="ring-foreground/[0.06] bg-card overflow-hidden rounded-xl shadow-sm ring-1">
        <div className="border-b px-4 py-3">
          <h2 className="cdaf-title text-sm">Franjas del grupo</h2>
        </div>
        {franjas.length === 0 ? (
          <p className="text-muted-foreground px-4 py-6 text-center text-sm">
            Todavía no tiene franjas. Agrega la primera abajo.
          </p>
        ) : (
          <ul className="divide-y">
            {franjas.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                <span className="font-heading w-36 shrink-0 font-semibold tabular-nums">
                  {DIA_CORTO[f.dia]} {hhmm(f.horaInicio)}–{hhmm(f.horaFin)}
                </span>
                <span className="text-muted-foreground min-w-0 flex-grow truncate">
                  {profesores.find((p) => p.id === f.profesorId)?.nombre ?? "sin profesor"}
                  {f.cancha ? ` · cancha ${f.cancha}` : ""}
                </span>
                <span className="text-muted-foreground w-32 shrink-0 text-xs tabular-nums">
                  {f.inscritos} de {f.cupo ?? cupoNivel}
                  {f.cupo != null && <span className="ml-1">(cupo propio)</span>}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <Button type="button" variant="ghost" size="sm" onClick={() => { setEditando(f); setOkBorrar(null); }}>
                    <Pencil className="size-3.5" /> Editar
                  </Button>
                  {borrando === f.id ? (
                    <>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={borrandoPending}
                        onClick={() =>
                          startBorrar(async () => {
                            const r = await eliminarFranja(f.id, grupoId, academiaId);
                            setErrBorrar(r.error ?? null);
                            setOkBorrar(r.ok ?? null);
                            setBorrando(null);
                            if (editando?.id === f.id) setEditando(null);
                          })
                        }
                      >
                        Sí, borrar
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setBorrando(null)}>No</Button>
                    </>
                  ) : (
                    <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => setBorrando(f.id)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {errBorrar && <p className="text-destructive text-sm">{errBorrar}</p>}
      {okBorrar && <p className="border-lime/50 bg-lime/10 rounded-md border px-3 py-2 text-sm">✓ {okBorrar}</p>}

      <form key={formKey} action={action} className="ring-foreground/[0.06] bg-card space-y-4 rounded-xl p-4.5 shadow-sm ring-1">
        <input type="hidden" name="academiaId" value={academiaId} />
        <input type="hidden" name="grupoId" value={grupoId} />
        {editando && <input type="hidden" name="franjaId" value={editando.id} />}

        <h2 className="cdaf-title text-sm">{editando ? "Editar franja" : "Agregar franja"}</h2>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="dia" className="text-sm font-medium">Día</label>
            <select id="dia" name="dia" defaultValue={String(editando?.dia ?? 2)} className={`${SELECT} mt-1`}>
              {DIAS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="hora" className="text-sm font-medium">Hora de inicio</label>
            <Input id="hora" name="hora" type="time" defaultValue={hhmm(editando?.horaInicio ?? "15:30:00")} className="mt-1" />
          </div>
          <div>
            <label htmlFor="duracion" className="text-sm font-medium">Dura</label>
            <select
              id="duracion"
              name="duracion"
              defaultValue={String(editando ? duracionDe(editando.horaInicio, editando.horaFin) : 60)}
              className={`${SELECT} mt-1`}
            >
              {DURACIONES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="profesorId" className="text-sm font-medium">Profesor</label>
            <select id="profesorId" name="profesorId" defaultValue={editando?.profesorId ?? ""} className={`${SELECT} mt-1`}>
              <option value="">— Sin asignar —</option>
              {profesores.map((p) => <option key={p.id} value={p.id}>{p.nombre ?? "—"}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="cancha" className="text-sm font-medium">Cancha</label>
            <Input id="cancha" name="cancha" defaultValue={editando?.cancha ?? ""} placeholder="3" className="mt-1" />
          </div>
          <div>
            <label htmlFor="cupo" className="text-sm font-medium">Cupo propio</label>
            <Input
              id="cupo"
              name="cupo"
              type="number"
              min={1}
              defaultValue={editando?.cupo != null ? String(editando.cupo) : ""}
              placeholder={String(cupoNivel)}
              className="mt-1"
            />
          </div>
        </div>

        <p className="text-muted-foreground text-xs">
          Deja el cupo vacío para usar el del nivel ({cupoNivel} niños). Solo se llena si esta franja
          es una excepción. En cualquier caso el cupo <strong>avisa, no bloquea</strong>.
        </p>

        {state.error && <p className="text-destructive text-sm">{state.error}</p>}
        {state.ok && <p className="border-lime/50 bg-lime/10 rounded-md border px-3 py-2 text-sm">✓ {state.ok}</p>}

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : editando ? "Guardar franja" : "Agregar franja"}
          </Button>
          {editando && (
            <Button type="button" variant="outline" onClick={() => setEditando(null)}>
              Cancelar edición
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
