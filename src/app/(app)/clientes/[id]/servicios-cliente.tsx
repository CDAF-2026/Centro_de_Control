"use client";

import { useActionState, useState } from "react";
import { anularPaqueteCliente, asignarPaquete, editarPaqueteCliente, type ClienteFormState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Pencil } from "lucide-react";

type InscHorario = { dia: number; inicio: string; fin: string; cancha: string | null };
type Insc = {
  id: number;
  /** Grupo del niño dentro de la academia (nombre editable: Disney / tenistas). */
  grupo: string | null;
  nivel: string | null;
  descuento_pct: number;
  academiaNombre: string;
  miembro: string | null;
  /** Cuándo viene: las franjas de su grupo a las que está apuntado. */
  horarios: InscHorario[];
};
type Pq = {
  id: number;
  num_clases: number;
  clases_consumidas: number;
  estado: string;
  descuento_pct: number;
  nombre: string;
  inicia: string;
  vence: string | null;
  miembro: string | null;
};

const empty: ClienteFormState = {};
const selectCls = "border-input bg-background h-9 rounded-md border px-2 text-sm";
const DIA_LABEL = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/**
 * Un paquete ya asignado. El superadministrador puede corregirle la vigencia y
 * el descuento, o anularlo si se asignó por error. Las clases del paquete y las
 * consumidas NO se editan: ese contador lo lleva el cierre de clases.
 */
function PaqueteFila({
  clienteId,
  p,
  hoy,
  esSuperadmin,
}: {
  clienteId: number;
  p: Pq;
  hoy: string;
  esSuperadmin: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [edState, edAction, edPending] = useActionState(
    async (prev: ClienteFormState, fd: FormData) => {
      const r = await editarPaqueteCliente(prev, fd);
      if (r.ok) setEditando(false);
      return r;
    },
    empty,
  );
  const [anState, anAction, anPending] = useActionState(anularPaqueteCliente, empty);

  const saldo = p.num_clases - p.clases_consumidas;
  const anulado = p.estado === "anulado";
  // Vencido por estado (lo marca el job nocturno) o por fecha (aún no ha corrido).
  const vencido = !anulado && (p.estado === "vencido" || (p.vence != null && p.vence < hoy));

  if (editando) {
    return (
      <li className="py-2">
        <form action={edAction} className="bg-muted/30 space-y-3 rounded-lg border p-3">
          <input type="hidden" name="paqueteId" value={p.id} />
          <input type="hidden" name="clienteId" value={clienteId} />
          <p className="font-medium">
            {p.nombre}
            <span className="text-muted-foreground font-normal"> · {saldo}/{p.num_clases} disponibles</span>
          </p>
          {vencido && saldo > 0 && (
            <p className="text-muted-foreground text-xs">
              Está vencido. Al ponerle una fecha de vencimiento futura vuelve a quedar disponible
              para cobrarle clases.
            </p>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <span className="text-muted-foreground block text-xs">Inicio</span>
              <input type="date" name="inicia_el" defaultValue={p.inicia} required className={selectCls} />
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground block text-xs">Vence</span>
              <input type="date" name="vence_el" defaultValue={p.vence ?? ""} className={selectCls} />
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground block text-xs">Descuento %</span>
              <Input name="descuento" type="number" min={0} max={100} defaultValue={String(p.descuento_pct)} className="w-20" />
            </div>
            <Button type="submit" size="sm" disabled={edPending}>{edPending ? "Guardando…" : "Guardar"}</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditando(false)}>Cancelar</Button>
          </div>
          {edState.error && <p className="text-destructive text-xs">{edState.error}</p>}
        </form>
      </li>
    );
  }

  return (
    <li className="py-2">
      <div className="flex items-center justify-between gap-3">
        <span className={anulado ? "text-muted-foreground" : undefined}>
          {p.nombre}{p.descuento_pct > 0 ? ` · ${p.descuento_pct}% desc.` : ""}
          {p.miembro && <span className="text-muted-foreground"> · {p.miembro}</span>}
          {p.vence && <span className="text-muted-foreground"> · vence {p.vence}</span>}
          {vencido && <span className="text-destructive"> · Vencido</span>}
          {anulado && <Badge variant="outline" className="ml-2">Anulado</Badge>}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-muted-foreground">
            {saldo}/{p.num_clases} disponibles{p.estado === "agotado" ? " · agotado" : ""}
          </span>
          {esSuperadmin && !anulado && (confirmando ? (
            <form action={anAction} className="flex items-center gap-1">
              <input type="hidden" name="paqueteId" value={p.id} />
              <input type="hidden" name="clienteId" value={clienteId} />
              <span className="text-muted-foreground text-xs">¿Anular?</span>
              <Button type="submit" size="sm" variant="destructive" disabled={anPending}>{anPending ? "Anulando…" : "Sí"}</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmando(false)}>No</Button>
            </form>
          ) : (
            <>
              {/* Atajo visible cuando ya venció: es el mismo formulario, pero el
                  superadministrador no tiene que adivinar que está tras el lápiz. */}
              {vencido && saldo > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  title="Darle una nueva fecha de vencimiento para que vuelva a estar disponible"
                  onClick={() => setEditando(true)}
                >
                  Extender vigencia
                </Button>
              )}
              <Button type="button" variant="ghost" size="icon-sm" title="Corregir vigencia o descuento" onClick={() => setEditando(true)}>
                <Pencil className="size-4" />
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmando(true)}>Anular</Button>
            </>
          ))}
        </div>
      </div>
      {anState.error && <p className="text-destructive mt-1 text-xs">{anState.error}</p>}
    </li>
  );
}

export function ServiciosCliente({
  clienteId,
  inscripciones,
  paquetes,
  catalogo,
  miembros = [],
  puedeEditar,
  esSuperadmin = false,
}: {
  clienteId: number;
  inscripciones: Insc[];
  paquetes: Pq[];
  catalogo: { id: number; nombre: string; num_clases: number }[];
  miembros?: { id: number; nombres: string; apellidos: string; es_titular: boolean }[];
  puedeEditar: boolean;
  /** Corregir o anular un paquete ya asignado es solo del superadministrador. */
  esSuperadmin?: boolean;
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
                  {i.grupo && <span className="text-muted-foreground"> · {i.grupo}</span>}
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
            {paquetes.map((p) => (
              <PaqueteFila key={p.id} clienteId={clienteId} p={p} hoy={hoy} esSuperadmin={esSuperadmin} />
            ))}
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
