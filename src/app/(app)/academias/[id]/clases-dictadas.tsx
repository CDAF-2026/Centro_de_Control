"use client";

import { useState, useTransition } from "react";
import { asistenciaDeClase, type AsistenteClase } from "../actions";
import { Badge } from "@/components/ui/badge";

const DIA_LABEL = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");

/** "2026-07-22" → "Miércoles 22 de jul". Se arma a mano para no depender de Intl
 *  en algo que se renderiza en servidor y navegador (rompe la hidratación). */
function fechaLarga(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return `${DIA_LABEL[dow]} ${d} de ${MES[m - 1]}`;
}

const MARCA: Record<string, { icono: string; texto: string; tono: "success" | "warning" | "destructive" | "secondary" }> = {
  presente: { icono: "✓", texto: "presente", tono: "success" },
  ausente: { icono: "✗", texto: "ausente", tono: "destructive" },
  excusa_medica: { icono: "⊘", texto: "excusa médica", tono: "warning" },
  reposicion: { icono: "+", texto: "reposición", tono: "secondary" },
};

export type ClaseDictada = {
  clase_id: number;
  fecha: string;
  hora_inicio: string;
  hora_fin: string | null;
  estado: string;
  profesorNombre: string | null;
  cancha: string | null;
  presentes: number;
  ausentes: number;
  excusas: number;
  reposiciones: number;
  esperados: number;
};

export function ClasesDictadas({ clases }: { clases: ClaseDictada[] }) {
  const [abierta, setAbierta] = useState<number | null>(null);
  const [cache, setCache] = useState<Record<number, AsistenteClase[]>>({});
  const [cargando, start] = useTransition();

  function alternar(id: number) {
    if (abierta === id) {
      setAbierta(null);
      return;
    }
    setAbierta(id);
    if (cache[id]) return;
    start(async () => {
      const r = await asistenciaDeClase(id);
      setCache((c) => ({ ...c, [id]: r }));
    });
  }

  if (clases.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No hay clases de esta academia en el periodo. Las clases entran desde la reserva de EasyCancha,
        en el calendario de clases.
      </p>
    );
  }

  return (
    <ul className="divide-y">
      {clases.map((c) => {
        const sinCerrar = c.estado !== "realizada";
        const abierto = abierta === c.clase_id;
        const gente = cache[c.clase_id];
        return (
          <li key={c.clase_id}>
            <button
              type="button"
              onClick={() => alternar(c.clase_id)}
              className="hover:bg-muted/40 flex w-full flex-wrap items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-sm"
              aria-expanded={abierto}
            >
              <span>
                <span className="font-medium">{fechaLarga(c.fecha)}</span>{" "}
                <span className="text-muted-foreground tabular-nums">
                  {hhmm(c.hora_inicio)}{c.hora_fin ? `–${hhmm(c.hora_fin)}` : ""}
                </span>
                <span className="text-muted-foreground">
                  {c.profesorNombre ? ` · ${c.profesorNombre}` : " · sin profesor"}
                  {c.cancha ? ` · cancha ${c.cancha}` : ""}
                </span>
              </span>
              <span className="flex items-center gap-2">
                {sinCerrar ? (
                  <Badge variant="warning">Sin cerrar</Badge>
                ) : (
                  <span className="tabular-nums">
                    <strong>{c.presentes}</strong>
                    <span className="text-muted-foreground"> de {c.esperados || "?"} esperados</span>
                  </span>
                )}
                <span className="text-muted-foreground text-xs">{abierto ? "▲" : "▼"}</span>
              </span>
            </button>

            {abierto && (
              <div className="px-2 pb-3">
                {!gente && cargando && <p className="text-muted-foreground text-xs">Cargando…</p>}
                {gente && gente.length === 0 && (
                  <p className="text-muted-foreground text-xs">
                    {sinCerrar
                      ? "Todavía no se ha tomado la asistencia de esta clase."
                      : "Se cerró sin registrar a nadie."}
                  </p>
                )}
                {gente && gente.length > 0 && (
                  <ul className="space-y-1 text-xs">
                    {gente.map((p) => {
                      const m = MARCA[p.estado] ?? { icono: "·", texto: p.estado, tono: "secondary" as const };
                      return (
                        <li key={p.miembro_id} className="flex items-center gap-2">
                          <span className="w-4 text-center">{m.icono}</span>
                          <span>{p.nombre}</span>
                          <Badge variant={m.tono}>{m.texto}</Badge>
                          {!p.esperado && (
                            <span className="text-muted-foreground">no era su día</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
