"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { guardarGrupo, type AcademiaFormState } from "../../actions";
import { NIVELES_GRUPO, NOMBRES_SUGERIDOS } from "@/lib/validations/academia";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EliminarGrupoButton } from "./eliminar-grupo-button";

const SELECT = "border-input bg-background h-9 w-full rounded-md border px-2 text-sm";

export type GrupoInicial = {
  id: number;
  nombre: string;
  nivel: string;
  edadMin: number;
  edadMax: number;
};

/**
 * Un grupo es EDAD + NIVEL. El nombre es una etiqueta libre (Disney en las
 * recreativas, tenistas en competencia) y se sugiere, no se impone: al club le
 * sirve para hablar del grupo, y nada del sistema depende de cómo se llame.
 */
export function GrupoForm({
  academiaId,
  categoria,
  inicial,
  usados,
}: {
  academiaId: number;
  categoria: string | null;
  inicial?: GrupoInicial;
  /** Nombres ya tomados en esta academia: no se sugieren de nuevo. */
  usados: string[];
}) {
  const [state, action, pending] = useActionState<AcademiaFormState, FormData>(guardarGrupo, {});
  const [nombre, setNombre] = useState(inicial?.nombre ?? "");
  const [nivel, setNivel] = useState(inicial?.nivel ?? (categoria === "competencia" ? "intermedio" : "iniciacion"));

  // En competencia no hay iniciación: lo bloquea el trigger de la base, así que
  // ni se ofrece (sería un error garantizado al guardar).
  const niveles = NIVELES_GRUPO.filter((n) => !(categoria === "competencia" && n.value === "iniciacion"));
  const tomados = new Set(usados.map((u) => u.toLowerCase()));
  const sugerencias = (categoria === "competencia" ? NOMBRES_SUGERIDOS.competencia : NOMBRES_SUGERIDOS.recreativa)
    .filter((n) => !tomados.has(n.toLowerCase()))
    .slice(0, 6);
  const cupo = NIVELES_GRUPO.find((n) => n.value === nivel)?.cupo ?? 0;
  const err = state.fieldErrors ?? {};

  return (
    <form action={action} className="max-w-xl space-y-5">
      <input type="hidden" name="academiaId" value={academiaId} />
      {inicial && <input type="hidden" name="grupoId" value={inicial.id} />}

      <div>
        <label htmlFor="nombre" className="text-sm font-medium">Nombre del grupo</label>
        <Input
          id="nombre"
          name="nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder={sugerencias[0] ?? "Nombre del grupo"}
          className="mt-1"
        />
        {err.nombre && <p className="text-destructive mt-1 text-xs">{err.nombre}</p>}
        {sugerencias.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-muted-foreground text-xs">Sugerencias:</span>
            {sugerencias.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setNombre(s)}
                className="border-border hover:border-lime bg-card inline-flex h-6 items-center rounded-4xl border px-2.5 text-xs transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="nivel" className="text-sm font-medium">Nivel</label>
          <select id="nivel" name="nivel" value={nivel} onChange={(e) => setNivel(e.target.value)} className={`${SELECT} mt-1`}>
            {niveles.map((n) => (
              <option key={n.value} value={n.value}>{n.label}</option>
            ))}
          </select>
          {err.nivel && <p className="text-destructive mt-1 text-xs">{err.nivel}</p>}
        </div>
        <div>
          <label htmlFor="edadMin" className="text-sm font-medium">Edad desde</label>
          <Input id="edadMin" name="edadMin" type="number" min={3} max={99} defaultValue={String(inicial?.edadMin ?? 6)} className="mt-1" />
          {err.edadMin && <p className="text-destructive mt-1 text-xs">{err.edadMin}</p>}
        </div>
        <div>
          <label htmlFor="edadMax" className="text-sm font-medium">Edad hasta</label>
          <Input id="edadMax" name="edadMax" type="number" min={3} max={99} defaultValue={String(inicial?.edadMax ?? 9)} className="mt-1" />
          {err.edadMax && <p className="text-destructive mt-1 text-xs">{err.edadMax}</p>}
        </div>
      </div>

      <p className="bg-muted text-muted-foreground rounded-lg px-3 py-2 text-xs">
        El nivel fija el cupo: <strong>{cupo} niños por franja</strong>. Cuando se pase, la pantalla
        avisa — nunca impide inscribir.
      </p>

      {state.error && <p className="text-destructive text-sm">{state.error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : inicial ? "Guardar cambios" : "Crear grupo"}
        </Button>
        <Link
          href={inicial ? `/academias/${academiaId}/grupos/${inicial.id}` : `/academias/${academiaId}`}
          className={buttonVariants({ variant: "outline" })}
        >
          Cancelar
        </Link>
        {inicial && <EliminarGrupoButton grupoId={inicial.id} academiaId={academiaId} />}
      </div>
    </form>
  );
}
