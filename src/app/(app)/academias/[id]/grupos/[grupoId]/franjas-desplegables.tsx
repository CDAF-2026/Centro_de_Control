"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { BarraOcupacion, DIA_CORTO, hhmm, tonoOcupacion } from "../../../ocupacion";

export type FranjaFila = {
  id: number;
  dia: number;
  horaInicio: string;
  horaFin: string;
  profesor: string | null;
  cancha: string | null;
  cupo: number;
  inscritos: number;
};

export type NinoEnFranja = {
  franjaId: number | null;
  miembroId: number;
  clienteId: number;
  nombre: string;
  edad: number;
  fueraDeRango: boolean;
  esperadas: number;
  presentes: number;
  excusas: number;
};

function Asistencia({ n }: { n: NinoEnFranja }) {
  const base = n.esperadas - n.excusas;
  if (base <= 0) return <span className="text-muted-foreground text-xs">sin clases aún</span>;
  const pct = Math.round((n.presentes / base) * 100);
  const col = pct >= 75 ? "bg-lime" : pct >= 50 ? "bg-warning" : "bg-destructive";
  return (
    <span className="flex items-center gap-2">
      <span className="bg-muted h-1.5 w-14 overflow-hidden rounded-full">
        <span className={`block h-1.5 rounded-full ${col}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </span>
      <span className="text-muted-foreground text-xs tabular-nums">
        {pct}% · {n.presentes} de {base}
      </span>
    </span>
  );
}

/**
 * Las franjas se despliegan para ver quiénes vienen a ESA clase. La franja es lo
 * que de verdad ocurre en la cancha, así que la pregunta operativa es "¿quién
 * viene el martes 15:30?" — en una lista plana del grupo eso hay que cruzarlo a
 * ojo con la columna de días.
 */
export function FranjasDesplegables({
  franjas,
  ninos,
  edadMin,
  edadMax,
}: {
  franjas: FranjaFila[];
  ninos: NinoEnFranja[];
  edadMin: number;
  edadMax: number;
}) {
  // La primera arranca abierta: una lista de acordeones toda cerrada obliga a un
  // clic extra para ver cualquier cosa.
  const [abiertas, setAbiertas] = useState<Set<number>>(new Set(franjas[0] ? [franjas[0].id] : []));
  const sinFranja = ninos.filter((n) => n.franjaId === null);

  function alternar(id: number) {
    setAbiertas((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  return (
    <div className="space-y-2">
      {franjas.map((f) => {
        const abierta = abiertas.has(f.id);
        const { tono } = tonoOcupacion(f.inscritos, f.cupo);
        const suyos = ninos.filter((n) => n.franjaId === f.id);
        return (
          <div key={f.id} className="ring-foreground/[0.06] bg-card overflow-hidden rounded-xl shadow-sm ring-1">
            <button
              type="button"
              onClick={() => alternar(f.id)}
              aria-expanded={abierta}
              className="hover:bg-muted/40 flex w-full items-center gap-4 px-4 py-3 text-left transition-colors"
            >
              <ChevronDown className={`text-muted-foreground size-4 shrink-0 transition-transform ${abierta ? "" : "-rotate-90"}`} />
              <span className="font-heading w-40 shrink-0 text-sm font-semibold tabular-nums">
                {DIA_CORTO[f.dia]} {hhmm(f.horaInicio)}–{hhmm(f.horaFin)}
              </span>
              <span className="text-muted-foreground hidden min-w-0 flex-grow truncate text-sm sm:block">
                {f.profesor ?? "sin profesor"}
                {f.cancha ? ` · cancha ${f.cancha}` : ""}
              </span>
              <span className="flex w-48 shrink-0 items-center gap-3">
                <BarraOcupacion ocupados={f.inscritos} cupo={f.cupo} />
                <span className={`shrink-0 text-xs tabular-nums ${tono === "sobre" ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                  {f.inscritos} de {f.cupo}
                </span>
              </span>
            </button>

            {abierta && (
              <div className="border-t">
                {suyos.length === 0 ? (
                  <p className="text-muted-foreground px-4 py-3 text-sm">Nadie inscrito en esta franja.</p>
                ) : (
                  <ul className="divide-y">
                    {suyos.map((n) => (
                      <li key={n.miembroId} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 pl-12 text-sm">
                        <span className="min-w-0 flex-grow font-medium">{n.nombre}</span>
                        <span className={`w-16 shrink-0 tabular-nums ${n.fueraDeRango ? "font-medium text-[#8a5600]" : "text-muted-foreground"}`}>
                          {n.edad} años
                        </span>
                        <span className="w-44 shrink-0"><Asistencia n={n} /></span>
                        <Link href={`/clientes/${n.clienteId}`} className="text-muted-foreground shrink-0 text-xs hover:underline">
                          Ficha
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        );
      })}

      {sinFranja.length > 0 && (
        <div className="border-warning/35 bg-warning/10 rounded-xl border px-4 py-3">
          <p className="text-sm font-medium text-[#6d4700]">
            {sinFranja.length === 1 ? "Un inscrito sin franja asignada" : `${sinFranja.length} inscritos sin franja asignada`}
          </p>
          <p className="mt-0.5 text-xs text-[#6d4700]">
            Están en el grupo pero no vienen ningún día. Edítalos para darles horario.
          </p>
          <ul className="mt-2 space-y-1">
            {sinFranja.map((n) => (
              <li key={n.miembroId} className="text-sm">
                {n.nombre} <span className="text-muted-foreground text-xs">· {n.edad} años</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-muted-foreground text-xs">
        La edad en ámbar queda fuera del rango del grupo ({edadMin} a {edadMax} años). No impide nada;
        es para revisarlo. La asistencia es la de <strong>esa franja</strong>, no la del grupo: un niño
        puede estar fallando solo un día de los dos que viene.
      </p>
    </div>
  );
}
