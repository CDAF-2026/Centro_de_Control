"use client";

import { useActionState } from "react";
import { asignarPaquete, type ClienteFormState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type InscHorario = { dia: number; inicio: string; fin: string; cancha: string | null };
type Insc = {
  id: number;
  nivel: string | null;
  descuento_pct: number;
  academiaNombre: string;
  miembro: string | null;
  /** Cuándo viene: el horario es del inscrito, no de la academia. */
  horarios: InscHorario[];
};
type Pq = {
  id: number;
  num_clases: number;
  clases_consumidas: number;
  estado: string;
  descuento_pct: number;
  nombre: string;
  vence: string | null;
  miembro: string | null;
};

const empty: ClienteFormState = {};
const selectCls = "border-input bg-background h-9 rounded-md border px-2 text-sm";
const DIA_LABEL = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export function ServiciosCliente({
  clienteId,
  inscripciones,
  paquetes,
  catalogo,
  miembros = [],
  puedeEditar,
}: {
  clienteId: number;
  inscripciones: Insc[];
  paquetes: Pq[];
  catalogo: { id: number; nombre: string; num_clases: number }[];
  miembros?: { id: number; nombres: string; apellidos: string; es_titular: boolean }[];
  puedeEditar: boolean;
}) {
  const [pqState, pqAction, pqPending] = useActionState(asignarPaquete, empty);
  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      {/* Academias */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Academias</h3>
        {inscripciones.length > 0 ? (
          <ul className="divide-y text-sm">
            {inscripciones.map((i) => (
              <li key={i.id} className="flex justify-between gap-3 py-2">
                <span>
                  {i.academiaNombre}
                  {i.miembro && <span className="text-muted-foreground"> · {i.miembro}</span>}
                  {i.nivel && <span className="text-muted-foreground"> · {i.nivel}</span>}
                </span>
                <span className="text-muted-foreground text-right">
                  {i.horarios.length > 0 ? (
                    <>
                      {i.horarios.map((h) => `${DIA_LABEL[h.dia]} ${h.inicio}`).join(" · ")}
                      {" · "}
                      {i.horarios.length}×sem
                    </>
                  ) : (
                    "sin horario"
                  )}
                  {i.descuento_pct > 0 ? ` · ${i.descuento_pct}% desc.` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">Sin academias inscritas.</p>
        )}
      </div>

      {/* Paquetes */}
      <div className="space-y-3 border-t pt-4">
        <h3 className="text-sm font-semibold">Paquetes</h3>
        {paquetes.length > 0 ? (
          <ul className="divide-y text-sm">
            {paquetes.map((p) => {
              const saldo = p.num_clases - p.clases_consumidas;
              return (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    {p.nombre}{p.descuento_pct > 0 ? ` · ${p.descuento_pct}% desc.` : ""}
                    {p.miembro && <span className="text-muted-foreground"> · {p.miembro}</span>}
                    {p.vence && <span className="text-muted-foreground"> · vence {p.vence}</span>}
                    {p.vence && p.vence < hoy && <span className="text-destructive"> · Vencido</span>}
                  </span>
                  <span className="text-muted-foreground">
                    {saldo}/{p.num_clases} disponibles{p.estado === "agotado" ? " · agotado" : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">Sin paquetes asignados.</p>
        )}
        {puedeEditar && catalogo.length > 0 && (
          <form action={pqAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="clienteId" value={clienteId} />
            {miembros.length > 1 && (
              <select name="miembroId" className={selectCls} title="¿Para cuál hermano?">
                {miembros.map((m) => (
                  <option key={m.id} value={m.id}>{m.nombres}{m.es_titular ? " (titular)" : ""}</option>
                ))}
              </select>
            )}
            <select name="catalogoId" required className={selectCls}>
              <option value="">Paquete…</option>
              {catalogo.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre} ({c.num_clases} clases)</option>
              ))}
            </select>
            <Input name="descuento" type="number" min={0} max={100} defaultValue={0} className="w-20" />
            <div className="space-y-1">
              <span className="text-muted-foreground block text-xs">Inicio</span>
              <input type="date" name="inicia_el" defaultValue={hoy} className={selectCls} />
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground block text-xs">Vence</span>
              <input type="date" name="vence_el" min={hoy} className={selectCls} />
            </div>
            <Button type="submit" size="sm" disabled={pqPending}>Asignar</Button>
            {pqState.error && <p className="text-destructive w-full text-xs">{pqState.error}</p>}
            {pqState.ok && <p className="text-primary w-full text-xs">{pqState.ok}</p>}
          </form>
        )}
        {puedeEditar && catalogo.length === 0 && (
          <p className="text-muted-foreground text-xs">
            No hay paquetes en el catálogo todavía. Créalos en la sección <strong>Paquetes</strong>.
          </p>
        )}
      </div>
    </div>
  );
}
