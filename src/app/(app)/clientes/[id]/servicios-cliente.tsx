"use client";

import { useActionState } from "react";
import { asignarPaquete, inscribirEnAcademia, type ClienteFormState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Insc = { id: number; plan_frecuencia: number; descuento_pct: number; academiaNombre: string };
type Pq = {
  id: number;
  num_clases: number;
  clases_consumidas: number;
  estado: string;
  descuento_pct: number;
  nombre: string;
};

const empty: ClienteFormState = {};
const selectCls = "border-input bg-background h-9 rounded-md border px-2 text-sm";

export function ServiciosCliente({
  clienteId,
  inscripciones,
  paquetes,
  academiasDisponibles,
  catalogo,
  puedeEditar,
}: {
  clienteId: number;
  inscripciones: Insc[];
  paquetes: Pq[];
  academiasDisponibles: { id: number; nombre: string }[];
  catalogo: { id: number; nombre: string; num_clases: number }[];
  puedeEditar: boolean;
}) {
  const [insState, insAction, insPending] = useActionState(inscribirEnAcademia, empty);
  const [pqState, pqAction, pqPending] = useActionState(asignarPaquete, empty);

  return (
    <div className="space-y-6">
      {/* Academias */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Academias</h3>
        {inscripciones.length > 0 ? (
          <ul className="divide-y text-sm">
            {inscripciones.map((i) => (
              <li key={i.id} className="flex justify-between py-2">
                <span>{i.academiaNombre}</span>
                <span className="text-muted-foreground">
                  {i.plan_frecuencia}×sem{i.descuento_pct > 0 ? ` · ${i.descuento_pct}% desc.` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">Sin academias inscritas.</p>
        )}
        {puedeEditar && academiasDisponibles.length > 0 && (
          <form action={insAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="clienteId" value={clienteId} />
            <select name="academiaId" required className={selectCls}>
              <option value="">Academia…</option>
              {academiasDisponibles.map((a) => (
                <option key={a.id} value={a.id}>{a.nombre}</option>
              ))}
            </select>
            <select name="plan" className={selectCls}>
              <option value="1">1×sem</option>
              <option value="2">2×sem</option>
              <option value="3">3×sem</option>
            </select>
            <Input name="descuento" type="number" min={0} max={100} defaultValue={0} className="w-20" />
            <Button type="submit" size="sm" disabled={insPending}>Inscribir</Button>
            {insState.error && <p className="text-destructive w-full text-xs">{insState.error}</p>}
            {insState.ok && <p className="text-primary w-full text-xs">{insState.ok}</p>}
          </form>
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
                <li key={p.id} className="flex justify-between py-2">
                  <span>{p.nombre}{p.descuento_pct > 0 ? ` · ${p.descuento_pct}% desc.` : ""}</span>
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
            <select name="catalogoId" required className={selectCls}>
              <option value="">Paquete…</option>
              {catalogo.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre} ({c.num_clases} clases)</option>
              ))}
            </select>
            <Input name="descuento" type="number" min={0} max={100} defaultValue={0} className="w-20" />
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
