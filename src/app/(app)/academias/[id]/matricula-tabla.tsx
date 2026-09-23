"use client";

import { useState } from "react";
import Link from "next/link";

export type FilaMatricula = {
  inscripcionId: number;
  clienteId: number;
  nombre: string;
  edad: number | null;
  desde: string;
  clases: { id: number; etiqueta: string; titulo: string; color: string; fondo: string }[];
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** La tabla de la matrícula con buscador por nombre y filtro por veces a la semana. */
export function MatriculaTabla({ filas }: { filas: FilaMatricula[] }) {
  const [q, setQ] = useState("");
  const [veces, setVeces] = useState("todas");
  const visibles = filas.filter((f) => {
    if (q && !norm(f.nombre).includes(norm(q))) return false;
    const n = f.clases.length;
    if (veces === "0") return n === 0;
    if (veces === "1") return n === 1;
    if (veces === "2") return n === 2;
    if (veces === "3") return n >= 3;
    return true;
  });

  return (
    <div className="ring-foreground/[0.06] bg-card overflow-hidden rounded-xl shadow-sm ring-1">
      <div className="border-border flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <input
          id="buscar-matricula"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar niño…"
          aria-label="Buscar niño"
          className="border-input bg-background h-9 min-w-48 flex-1 rounded-md border px-3 text-sm"
        />
        <select
          id="filtro-veces"
          aria-label="Veces por semana"
          value={veces}
          onChange={(e) => setVeces(e.target.value)}
          className="border-input bg-background h-9 rounded-md border px-2 text-sm"
        >
          <option value="todas">Todas las frecuencias</option>
          <option value="1">1 vez a la semana</option>
          <option value="2">2 veces</option>
          <option value="3">3 o más</option>
          <option value="0">Sin ningún día</option>
        </select>
        <span className="text-muted-foreground text-xs tabular-nums">
          {visibles.length} de {filas.length}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr className="border-border text-muted-foreground border-b text-[11px] font-bold tracking-wider uppercase">
              <th className="px-4 py-2.5 text-left">Niño</th>
              <th className="px-2 py-2.5 text-left">Edad</th>
              <th className="px-2 py-2.5 text-left">Viene</th>
              <th className="px-2 py-2.5 text-left">Por semana</th>
              <th className="px-4 py-2.5 text-left">Desde</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((f) => (
              <tr key={f.inscripcionId} className="border-t border-[#f0f3f3]">
                <td className="px-4 py-2.5">
                  <Link href={`/clientes/${f.clienteId}`} className="font-semibold hover:underline">{f.nombre}</Link>
                </td>
                <td className="text-muted-foreground px-2 py-2.5 tabular-nums">{f.edad ?? "—"}</td>
                <td className="px-2 py-2.5">
                  {f.clases.length === 0 ? (
                    <span className="text-xs font-semibold text-[#6d4700]">sin ningún día</span>
                  ) : (
                    <span className="flex flex-wrap gap-1">
                      {f.clases.map((c) => (
                        <Link
                          key={c.id}
                          href={`/academias/clase/${c.id}`}
                          title={c.titulo}
                          className="inline-flex h-5 items-center rounded-full border-l-[3px] px-2 text-[11px] tabular-nums hover:shadow-sm"
                          style={{ background: c.fondo, borderLeftColor: c.color }}
                        >
                          {c.etiqueta}
                        </Link>
                      ))}
                    </span>
                  )}
                </td>
                <td className="font-heading px-2 py-2.5 font-bold tabular-nums">{f.clases.length}×</td>
                <td className="text-muted-foreground px-4 py-2.5 tabular-nums">{f.desde}</td>
              </tr>
            ))}
            {visibles.length === 0 && (
              <tr>
                <td colSpan={5} className="text-muted-foreground px-4 py-8 text-center">Nadie coincide con esa búsqueda.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
