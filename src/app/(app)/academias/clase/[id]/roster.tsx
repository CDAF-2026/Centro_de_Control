"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MiembroAutocomplete } from "@/components/miembro-autocomplete";
import { Button } from "@/components/ui/button";
import {
  agregarNinoAClase,
  quitarDeClase,
  moverDeClase,
  retirarDeAcademia,
  cambiarCategoria,
  datosDelNino,
  type NinoInfo,
} from "../../actions";

export type NinoEnClase = {
  inscripcionId: number;
  miembroId: number;
  clienteId: number;
  nombre: string;
  edad: number | null;
  academiaId: number;
  categoria: string;
  /** Cuántas OTRAS clases tiene a la semana. 0 = este es su único día. */
  otrasClases: number;
};
export type ClaseOpcion = { id: number; etiqueta: string };
export type AcademiaOpcion = { id: number; nombre: string; categoria: string };

const SELECT = "border-input bg-background h-8 rounded-md border px-2 text-xs";

/**
 * La lista de la clase con las acciones A LA VISTA (rediseño 23-sep-2026,
 * opción A): agregar arriba, y en cada niño mover, quitar de este día y
 * retirar. Nada escondido tras un "Gestionar": son las tres cosas que el club
 * pidió poder hacer y las que más se hacen.
 */
export function RosterClase({
  claseId,
  ninos,
  destinos,
  academias,
  puedeEditar,
}: {
  claseId: number;
  ninos: NinoEnClase[];
  destinos: ClaseOpcion[];
  academias: AcademiaOpcion[];
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tipo: "ok" | "mal"; texto: string } | null>(null);
  const [moviendo, setMoviendo] = useState<number | null>(null);
  const [retirando, setRetirando] = useState<number | null>(null);
  const [nuevo, setNuevo] = useState<(NinoInfo & { miembroId: number }) | null>(null);
  const [academiaNueva, setAcademiaNueva] = useState<number>(academias[0]?.id ?? 0);

  function correr(fn: () => Promise<{ ok?: string; error?: string }>, despues?: () => void) {
    setMsg(null);
    start(async () => {
      const r = await fn();
      if (r.error) setMsg({ tipo: "mal", texto: r.error });
      else {
        setMsg({ tipo: "ok", texto: r.ok ?? "Listo." });
        despues?.();
        router.refresh();
      }
    });
  }

  function elegirNino(sel: { miembroId: number; clienteId: number } | null) {
    setMsg(null);
    if (!sel) { setNuevo(null); return; }
    start(async () => {
      const d = await datosDelNino(sel.miembroId);
      if (d) setNuevo({ ...d, miembroId: sel.miembroId });
    });
  }

  const soloAqui = ninos.filter((n) => n.otrasClases === 0).length;

  return (
    <div className="space-y-4">
      {msg && (
        <p
          role="status"
          className={`rounded-xl border px-4 py-3 text-sm ${
            msg.tipo === "ok" ? "border-lime/50 bg-lime/10" : "border-destructive/40 bg-destructive/5 text-destructive"
          }`}
        >
          {msg.texto}
        </p>
      )}

      <section className="ring-foreground/[0.06] bg-card overflow-hidden rounded-xl shadow-sm ring-1">
        <div className="border-border flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3.5">
          <h2 className="font-heading text-base font-bold uppercase">
            {ninos.length} {ninos.length === 1 ? "niño" : "niños"}
          </h2>
          <p className="text-muted-foreground text-xs">
            {soloAqui > 0 && (
              <span className="font-semibold text-[#6d4700]">
                {soloAqui === 1 ? "1 viene solo este día" : `${soloAqui} vienen solo este día`} ·{" "}
              </span>
            )}
            Sin tope de cupo: se ve cuántos van.
          </p>
        </div>

        {puedeEditar && (
          <div className="border-border bg-muted/30 border-b px-4 py-3">
            {nuevo ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm">
                  <strong>{nuevo.nombre}</strong>
                  {nuevo.edad != null && <span className="text-muted-foreground"> · {nuevo.edad} años</span>}
                </span>
                <select
                  aria-label="Academia"
                  className="border-input bg-background h-9 rounded-md border px-2 text-sm"
                  value={academiaNueva}
                  onChange={(e) => setAcademiaNueva(Number(e.target.value))}
                  disabled={pending}
                >
                  {academias.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                </select>
                <Button
                  size="sm"
                  disabled={pending || !academiaNueva}
                  onClick={() =>
                    correr(
                      () => agregarNinoAClase({ claseId, miembroId: nuevo.miembroId, academiaId: academiaNueva }),
                      () => setNuevo(null),
                    )
                  }
                >
                  Agregar a esta clase
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setNuevo(null)} disabled={pending}>
                  Cambiar
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-semibold">Agregar un niño</span>
                <div className="min-w-60 flex-1"><MiembroAutocomplete onSelect={elegirNino} /></div>
                <span className="text-muted-foreground text-xs">
                  ¿No aparece? Créale la ficha en <Link href="/clientes" className="underline">Clientes</Link>.
                </span>
              </div>
            )}
          </div>
        )}

        {ninos.length === 0 ? (
          <p className="text-muted-foreground px-4 py-8 text-center text-sm">Todavía no viene nadie a esta clase.</p>
        ) : (
          <ul>
            {ninos.map((n) => (
              <li key={n.inscripcionId} className="border-t border-[#f0f3f3] px-4 py-3 first:border-t-0">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/clientes/${n.clienteId}`} className="text-sm font-semibold hover:underline">
                      {n.nombre}
                    </Link>
                    <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-xs">
                      {n.edad != null && <span className="tabular-nums">{n.edad} años</span>}
                      {puedeEditar ? (
                        <select
                          aria-label={`Academia de ${n.nombre}`}
                          className={SELECT}
                          value={n.academiaId}
                          disabled={pending}
                          onChange={(e) => correr(() => cambiarCategoria(n.inscripcionId, Number(e.target.value)))}
                        >
                          {academias.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                        </select>
                      ) : (
                        <span>{n.categoria === "competencia" ? "Competencia" : "Recreativa"}</span>
                      )}
                      <span className={n.otrasClases === 0 ? "font-semibold text-[#6d4700]" : ""}>
                        {n.otrasClases === 0
                          ? "Este es su único día"
                          : `${n.otrasClases} ${n.otrasClases === 1 ? "día más" : "días más"} a la semana`}
                      </span>
                    </div>
                  </div>
                  {puedeEditar && (
                    <div className="flex flex-wrap gap-1.5">
                      <Button variant="outline" size="sm" disabled={pending} onClick={() => { setMoviendo(moviendo === n.inscripcionId ? null : n.inscripcionId); setRetirando(null); }}>
                        Mover de horario
                      </Button>
                      <Button variant="outline" size="sm" disabled={pending} onClick={() => correr(() => quitarDeClase(n.inscripcionId, claseId))}>
                        Quitar de este día
                      </Button>
                      <Button variant="outline" size="sm" disabled={pending} className="text-destructive" onClick={() => { setRetirando(retirando === n.inscripcionId ? null : n.inscripcionId); setMoviendo(null); }}>
                        Retirar
                      </Button>
                    </div>
                  )}
                </div>

                {moviendo === n.inscripcionId && (
                  <div className="bg-muted/40 mt-2.5 flex flex-wrap items-center gap-2 rounded-lg p-2.5">
                    <span className="text-xs">Llevarlo a:</span>
                    <select
                      aria-label="Clase de destino"
                      className="border-input bg-background h-8 min-w-64 flex-1 rounded-md border px-2 text-xs"
                      defaultValue=""
                      disabled={pending}
                      onChange={(e) => {
                        const destino = Number(e.target.value);
                        if (destino) correr(() => moverDeClase({ inscripcionId: n.inscripcionId, desdeClaseId: claseId, haciaClaseId: destino }), () => setMoviendo(null));
                      }}
                    >
                      <option value="">Escoge la clase de destino…</option>
                      {destinos.map((d) => <option key={d.id} value={d.id}>{d.etiqueta}</option>)}
                    </select>
                  </div>
                )}

                {retirando === n.inscripcionId && (
                  <div className="border-destructive/30 bg-destructive/5 mt-2.5 flex flex-wrap items-center gap-2 rounded-lg border p-2.5">
                    <span className="text-xs">
                      ¿Retirar a <strong>{n.nombre}</strong> de la academia? Se le quitan todos sus días; su historial de
                      asistencia se conserva.
                    </span>
                    <div className="ml-auto flex gap-1.5">
                      <Button size="sm" variant="ghost" onClick={() => setRetirando(null)}>Cancelar</Button>
                      <Button size="sm" variant="destructive" disabled={pending} onClick={() => correr(() => retirarDeAcademia(n.inscripcionId), () => setRetirando(null))}>
                        Sí, retirar
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
