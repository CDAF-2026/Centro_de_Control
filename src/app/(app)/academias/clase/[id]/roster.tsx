"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MiembroAutocomplete } from "@/components/miembro-autocomplete";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

const SELECT =
  "border-input bg-background h-9 rounded-md border px-2 text-sm";

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
  const [abierto, setAbierto] = useState<number | null>(null);

  // Alta de un niño nuevo
  const [nuevo, setNuevo] = useState<(NinoInfo & { miembroId: number }) | null>(null);
  const [academiaNueva, setAcademiaNueva] = useState<number>(academias[0]?.id ?? 0);

  function correr(fn: () => Promise<{ ok?: string; error?: string }>, alTerminar?: () => void) {
    setMsg(null);
    start(async () => {
      const r = await fn();
      if (r.error) setMsg({ tipo: "mal", texto: r.error });
      else {
        setMsg({ tipo: "ok", texto: r.ok ?? "Listo." });
        alTerminar?.();
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

  return (
    <div className="space-y-4">
      {msg && (
        <p
          className={`rounded-xl border px-4 py-3 text-sm ${
            msg.tipo === "ok" ? "border-lime/50 bg-lime/10" : "border-destructive/40 bg-destructive/5 text-destructive"
          }`}
        >
          {msg.texto}
        </p>
      )}

      <section className="ring-foreground/[0.06] bg-card rounded-xl shadow-sm ring-1">
        <div className="border-border flex flex-wrap items-baseline justify-between gap-2 border-b px-5 py-4">
          <h2 className="cdaf-title text-base">
            {ninos.length} {ninos.length === 1 ? "niño" : "niños"}
          </h2>
          <p className="text-muted-foreground text-xs">
            Sin tope de cupo: aquí se ve cuántos van, no cuántos caben.
          </p>
        </div>

        {ninos.length === 0 ? (
          <p className="text-muted-foreground px-5 py-8 text-center text-sm">
            Todavía no viene nadie a esta clase.
          </p>
        ) : (
          <ul className="divide-border divide-y">
            {ninos.map((n) => (
              <li key={n.inscripcionId} className="px-5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <Link href={`/clientes/${n.clienteId}`} className="text-sm font-medium hover:underline">
                      {n.nombre}
                    </Link>
                    <p className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-2 text-[11px]">
                      {n.edad != null && <span className="tabular-nums">{n.edad} años</span>}
                      <Badge variant={n.categoria === "competencia" ? "secondary" : "outline"}>
                        {n.categoria === "competencia" ? "Competencia" : "Recreativa"}
                      </Badge>
                      <span>
                        {n.otrasClases === 0
                          ? "este es su único día"
                          : `${n.otrasClases} ${n.otrasClases === 1 ? "día más" : "días más"} a la semana`}
                      </span>
                    </p>
                  </div>
                  {puedeEditar && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAbierto(abierto === n.inscripcionId ? null : n.inscripcionId)}
                    >
                      {abierto === n.inscripcionId ? "Cerrar" : "Gestionar"}
                    </Button>
                  )}
                </div>

                {puedeEditar && abierto === n.inscripcionId && (
                  <div className="bg-muted/40 mt-3 space-y-3 rounded-lg p-3">
                    <Fila titulo="Moverlo a otro horario" nota="Cambia de clase sin perder la matrícula.">
                      <select
                        className={SELECT}
                        defaultValue=""
                        disabled={pending}
                        onChange={(e) => {
                          const destino = Number(e.target.value);
                          if (!destino) return;
                          e.target.value = "";
                          correr(() =>
                            moverDeClase({ inscripcionId: n.inscripcionId, desdeClaseId: claseId, haciaClaseId: destino }),
                          );
                        }}
                      >
                        <option value="">Escoge la clase de destino…</option>
                        {destinos.map((d) => (
                          <option key={d.id} value={d.id}>{d.etiqueta}</option>
                        ))}
                      </select>
                    </Fila>

                    <Fila titulo="Cambiarlo de academia" nota="Decide cómo se le cobra, no a qué clase viene.">
                      <select
                        className={SELECT}
                        value={n.academiaId}
                        disabled={pending}
                        onChange={(e) => correr(() => cambiarCategoria(n.inscripcionId, Number(e.target.value)))}
                      >
                        {academias.map((a) => (
                          <option key={a.id} value={a.id}>{a.nombre}</option>
                        ))}
                      </select>
                    </Fila>

                    <Fila
                      titulo="Sacarlo"
                      nota={
                        n.otrasClases === 0
                          ? "Este es su único día: quitarlo de la clase lo deja matriculado sin venir a nada."
                          : `Quitar solo este día le deja sus otros ${n.otrasClases}.`
                      }
                    >
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={pending}
                          onClick={() => correr(() => quitarDeClase(n.inscripcionId, claseId), () => setAbierto(null))}
                        >
                          Quitar de este día
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={pending}
                          onClick={() => {
                            if (!confirm(`¿Retirar a ${n.nombre} de la academia? Se le quitan todos sus días. Su historial de asistencia se conserva.`)) return;
                            correr(() => retirarDeAcademia(n.inscripcionId), () => setAbierto(null));
                          }}
                        >
                          Retirar de la academia
                        </Button>
                      </div>
                    </Fila>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {puedeEditar && (
        <section className="ring-foreground/[0.06] bg-card space-y-3 rounded-xl p-5 shadow-sm ring-1">
          <div>
            <h2 className="cdaf-title text-base">Agregar un niño</h2>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Si todavía no estaba matriculado, se matricula de una en la academia que escojas.
            </p>
          </div>

          {nuevo ? (
            <div className="space-y-3">
              <div className="border-lime/50 bg-lime/10 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3">
                <span className="text-sm">
                  <strong>{nuevo.nombre}</strong>
                  {nuevo.edad != null && <span className="text-muted-foreground"> · {nuevo.edad} años</span>}
                </span>
                <Button variant="outline" size="sm" onClick={() => setNuevo(null)} disabled={pending}>
                  Cambiar
                </Button>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-sm">
                  <span className="text-muted-foreground mb-1 block text-xs">Academia</span>
                  <select
                    className={SELECT}
                    value={academiaNueva}
                    onChange={(e) => setAcademiaNueva(Number(e.target.value))}
                    disabled={pending}
                  >
                    {academias.map((a) => (
                      <option key={a.id} value={a.id}>{a.nombre}</option>
                    ))}
                  </select>
                </label>
                <Button
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
              </div>
            </div>
          ) : (
            <>
              <MiembroAutocomplete onSelect={elegirNino} />
              <p className="text-muted-foreground text-xs">
                ¿No aparece? Créale la ficha primero en{" "}
                <Link href="/clientes" className="underline">Clientes</Link>.
              </p>
            </>
          )}
        </section>
      )}
    </div>
  );
}

function Fila({ titulo, nota, children }: { titulo: string; nota: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-48">
        <p className="text-sm font-medium">{titulo}</p>
        <p className="text-muted-foreground text-[11px]">{nota}</p>
      </div>
      {children}
    </div>
  );
}
