"use client";

import { useActionState, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { guardarReglas, type EmpleadoFormState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ReglaConcepto, ReglaMetodo } from "@/lib/database.types";

const init: EmpleadoFormState = {};
const SELECT = "border-input bg-background h-9 w-full rounded-md border px-2 text-sm";

const CONCEPTOS: { v: ReglaConcepto; l: string }[] = [
  { v: "clase_particular", l: "Clases particulares" },
  { v: "paquete", l: "Paquetes" },
  { v: "academia", l: "Academia (clases)" },
  { v: "clase", l: "Cualquier clase" },
  { v: "siigo", l: "Alto rendimiento (Siigo)" },
  { v: "salario", l: "Salario fijo" },
];
const METODOS: { v: ReglaMetodo; l: string }[] = [
  { v: "pct_facturado", l: "% de lo facturado" },
  { v: "fijo_por_clase", l: "Valor fijo por clase" },
  { v: "escalonado_asistentes", l: "Escalonado por nº de personas" },
  { v: "por_alumno", l: "Por alumno presente" },
  { v: "pct_siigo_servicio", l: "% de facturación Siigo" },
  { v: "salario_fijo", l: "Salario fijo (mensual)" },
  { v: "comision_umbral", l: "Comisión al pasar un tope de clases" },
];
// Días de la semana (0=domingo … 6=sábado), en orden L→D para mostrar.
const DIAS = [
  { v: 1, l: "L" },
  { v: 2, l: "M" },
  { v: 3, l: "X" },
  { v: 4, l: "J" },
  { v: 5, l: "V" },
  { v: 6, l: "S" },
  { v: 0, l: "D" },
];

const esClaseMetodo = (m: ReglaMetodo) =>
  m === "pct_facturado" || m === "fijo_por_clase" || m === "escalonado_asistentes" || m === "por_alumno";

type EditEscalon = { min: string; valor: string };
type EditRegla = {
  key: string;
  nombre: string;
  concepto: ReglaConcepto;
  metodo: ReglaMetodo;
  pct: string;
  valor: string;
  servicioId: string;
  escalones: EditEscalon[];
  dias: number[];
  horaDesde: string;
  horaHasta: string;
  umbral: string;
};

export type ReglaInicial = {
  nombre: string;
  concepto: ReglaConcepto;
  metodo: ReglaMetodo;
  pct: number;
  valor: number;
  servicio_id: number | null;
  escalones: { min: number; valor: number }[] | null;
  dias: number[] | null;
  hora_desde: string | null;
  hora_hasta: string | null;
  umbral: number | null;
};

const nuevaKey = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()));
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");

function aEdit(r: ReglaInicial): EditRegla {
  return {
    key: nuevaKey(),
    nombre: r.nombre,
    concepto: r.concepto,
    metodo: r.metodo,
    pct: String(r.pct ?? 0),
    valor: String(r.valor ?? 0),
    servicioId: r.servicio_id != null ? String(r.servicio_id) : "",
    escalones: (r.escalones ?? []).map((e) => ({ min: String(e.min), valor: String(e.valor) })),
    dias: r.dias ?? [],
    horaDesde: hhmm(r.hora_desde),
    horaHasta: hhmm(r.hora_hasta),
    umbral: r.umbral != null ? String(r.umbral) : "",
  };
}

/** Editor de la lista de reglas de compensación de un profesor. */
export function ReglasForm({
  profesorId,
  reglasIniciales,
  servicios,
}: {
  profesorId: string;
  reglasIniciales: ReglaInicial[];
  servicios: { id: number; nombre: string }[];
}) {
  const [state, action, pending] = useActionState(guardarReglas, init);
  const [reglas, setReglas] = useState<EditRegla[]>(reglasIniciales.map(aEdit));

  const patch = (key: string, campo: Partial<EditRegla>) =>
    setReglas((rs) => rs.map((r) => (r.key === key ? { ...r, ...campo } : r)));

  const setConcepto = (key: string, concepto: ReglaConcepto) =>
    setReglas((rs) =>
      rs.map((r) => {
        if (r.key !== key) return r;
        if (concepto === "siigo") return { ...r, concepto, metodo: "pct_siigo_servicio" };
        if (concepto === "salario") return { ...r, concepto, metodo: "salario_fijo" };
        // Concepto de clase: si venía de siigo/salario, vuelve a un método de clase.
        const metodo = esClaseMetodo(r.metodo) ? r.metodo : "pct_facturado";
        return { ...r, concepto, metodo };
      }),
    );

  const setMetodo = (key: string, metodo: ReglaMetodo) =>
    setReglas((rs) =>
      rs.map((r) => {
        if (r.key !== key) return r;
        const next: EditRegla = { ...r, metodo };
        if (metodo === "pct_siigo_servicio") next.concepto = "siigo";
        else if (metodo === "salario_fijo") next.concepto = "salario";
        else if (metodo === "comision_umbral") next.concepto = "clase"; // cuenta cualquier clase
        else if (r.concepto === "siigo" || r.concepto === "salario") next.concepto = "clase_particular";
        if (metodo === "escalonado_asistentes" && r.escalones.length === 0) {
          next.escalones = [{ min: "1", valor: "" }];
        }
        return next;
      }),
    );

  const agregar = () =>
    setReglas((rs) => [
      ...rs,
      {
        key: nuevaKey(),
        nombre: "",
        concepto: "clase_particular",
        metodo: "pct_facturado",
        pct: "50",
        valor: "0",
        servicioId: "",
        escalones: [],
        dias: [],
        horaDesde: "",
        horaHasta: "",
        umbral: "",
      },
    ]);

  const quitar = (key: string) => setReglas((rs) => rs.filter((r) => r.key !== key));

  const toggleDia = (key: string, dia: number) =>
    setReglas((rs) =>
      rs.map((r) =>
        r.key === key ? { ...r, dias: r.dias.includes(dia) ? r.dias.filter((d) => d !== dia) : [...r.dias, dia] } : r,
      ),
    );

  // Escalones
  const addEscalon = (key: string) =>
    setReglas((rs) =>
      rs.map((r) => (r.key === key ? { ...r, escalones: [...r.escalones, { min: String(r.escalones.length + 1), valor: "" }] } : r)),
    );
  const patchEscalon = (key: string, i: number, campo: Partial<EditEscalon>) =>
    setReglas((rs) =>
      rs.map((r) => (r.key === key ? { ...r, escalones: r.escalones.map((e, j) => (j === i ? { ...e, ...campo } : e)) } : r)),
    );
  const quitarEscalon = (key: string, i: number) =>
    setReglas((rs) => rs.map((r) => (r.key === key ? { ...r, escalones: r.escalones.filter((_, j) => j !== i) } : r)));

  const payload = reglas.map((r) => ({
    nombre: r.nombre.trim(),
    concepto: r.concepto,
    metodo: r.metodo,
    pct: Number(r.pct) || 0,
    valor: Number(r.valor) || 0,
    servicio_id: r.servicioId ? Number(r.servicioId) : null,
    escalones:
      r.metodo === "escalonado_asistentes"
        ? r.escalones.map((e) => ({ min: Number(e.min) || 1, valor: Number(e.valor) || 0 }))
        : null,
    dias: esClaseMetodo(r.metodo) && r.dias.length ? [...r.dias].sort((a, b) => a - b) : null,
    hora_desde: esClaseMetodo(r.metodo) && r.horaDesde ? r.horaDesde : null,
    hora_hasta: esClaseMetodo(r.metodo) && r.horaHasta ? r.horaHasta : null,
    umbral: r.metodo === "comision_umbral" && r.umbral ? Number(r.umbral) : null,
  }));

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="profesorId" value={profesorId} />
      <input type="hidden" name="reglas" value={JSON.stringify(payload)} />

      {reglas.length === 0 && (
        <p className="text-muted-foreground text-sm">
          Sin reglas personalizadas. Agrega reglas para liquidar a este profesor con el modelo nuevo.
        </p>
      )}

      <div className="space-y-3">
        {reglas.map((r) => {
          const esSiigo = r.metodo === "pct_siigo_servicio";
          const esFijoClase = r.metodo === "fijo_por_clase" || r.metodo === "por_alumno";
          const esSalario = r.metodo === "salario_fijo";
          const esPct = r.metodo === "pct_facturado";
          const esEscalon = r.metodo === "escalonado_asistentes";
          const esUmbral = r.metodo === "comision_umbral";
          const conFiltro = esClaseMetodo(r.metodo);
          return (
            <div key={r.key} className="bg-muted/30 space-y-3 rounded-lg border p-3">
              <div className="flex items-start gap-2">
                <div className="flex-1 space-y-1.5">
                  <Label>Nombre de la regla</Label>
                  <Input
                    value={r.nombre}
                    onChange={(e) => patch(r.key, { nombre: e.target.value })}
                    placeholder="Ej: Comisión clases 7 a.m."
                  />
                </div>
                <button
                  type="button"
                  onClick={() => quitar(r.key)}
                  className="text-muted-foreground hover:text-destructive mt-7 shrink-0 p-1"
                  aria-label="Quitar regla"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>¿Por qué trabajo?</Label>
                  <select
                    className={SELECT}
                    value={r.concepto}
                    onChange={(e) => setConcepto(r.key, e.target.value as ReglaConcepto)}
                  >
                    {CONCEPTOS.map((c) => (
                      <option key={c.v} value={c.v}>{c.l}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>¿Cómo se paga?</Label>
                  <select
                    className={SELECT}
                    value={r.metodo}
                    onChange={(e) => setMetodo(r.key, e.target.value as ReglaMetodo)}
                  >
                    {METODOS.map((m) => (
                      <option key={m.v} value={m.v}>{m.l}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Parámetros según el método */}
              {esPct && (
                <div className="space-y-1.5">
                  <Label>Porcentaje (%)</Label>
                  <Input type="number" min={0} max={100} className="w-32" value={r.pct} onChange={(e) => patch(r.key, { pct: e.target.value })} />
                </div>
              )}

              {esFijoClase && (
                <div className="space-y-1.5">
                  <Label>{r.metodo === "por_alumno" ? "Valor por alumno (COP)" : "Valor por clase (COP)"}</Label>
                  <Input type="number" min={0} className="w-48" value={r.valor} onChange={(e) => patch(r.key, { valor: e.target.value })} />
                </div>
              )}

              {esSalario && (
                <div className="space-y-1.5">
                  <Label>Salario mensual (COP)</Label>
                  <Input type="number" min={0} className="w-48" value={r.valor} onChange={(e) => patch(r.key, { valor: e.target.value })} />
                  <p className="text-muted-foreground text-xs">Se prorratea por quincena (media quincena = la mitad).</p>
                </div>
              )}

              {esUmbral && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>El fijo cubre (clases/mes)</Label>
                    <Input type="number" min={1} value={r.umbral} onChange={(e) => patch(r.key, { umbral: e.target.value })} placeholder="140" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>% desde la clase siguiente</Label>
                    <Input type="number" min={0} max={100} value={r.pct} onChange={(e) => patch(r.key, { pct: e.target.value })} placeholder="30" />
                  </div>
                  <p className="text-muted-foreground col-span-2 text-xs">
                    El salario cubre las primeras N clases del mes; desde la clase N+1 comisiona ese % de lo facturado. Cuenta el acumulado del mes (todas las clases).
                  </p>
                </div>
              )}

              {esSiigo && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Servicio de Siigo</Label>
                    <select className={SELECT} value={r.servicioId} onChange={(e) => patch(r.key, { servicioId: e.target.value })}>
                      <option value="">— Elige un servicio —</option>
                      {servicios.map((s) => (
                        <option key={s.id} value={s.id}>{s.nombre}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Porcentaje (%)</Label>
                    <Input type="number" min={0} max={100} value={r.pct} onChange={(e) => patch(r.key, { pct: e.target.value })} />
                  </div>
                </div>
              )}

              {esEscalon && (
                <div className="space-y-2">
                  <Label>Escalones (según nº de personas)</Label>
                  {r.escalones.length === 0 && (
                    <p className="text-muted-foreground text-xs">Agrega los escalones: desde cuántas personas y cuánto se paga.</p>
                  )}
                  {r.escalones.map((e, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-muted-foreground text-sm">Desde</span>
                      <Input type="number" min={1} className="w-20" value={e.min} onChange={(ev) => patchEscalon(r.key, i, { min: ev.target.value })} />
                      <span className="text-muted-foreground text-sm">persona(s) →</span>
                      <Input type="number" min={0} className="w-40" value={e.valor} onChange={(ev) => patchEscalon(r.key, i, { valor: ev.target.value })} placeholder="COP" />
                      <button type="button" onClick={() => quitarEscalon(r.key, i)} className="text-muted-foreground hover:text-destructive p-1" aria-label="Quitar escalón">
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={() => addEscalon(r.key)}>
                    <Plus className="size-4" /> Agregar escalón
                  </Button>
                </div>
              )}

              {/* Filtro opcional por días + hora (para reglas de clase) */}
              {conFiltro && (
                <div className="border-border/60 space-y-2 rounded-md border border-dashed p-2.5">
                  <Label className="text-xs">Solo aplica a clases que empiezan en… (opcional)</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {DIAS.map((d) => {
                      const on = r.dias.includes(d.v);
                      return (
                        <button
                          key={d.v}
                          type="button"
                          onClick={() => toggleDia(r.key, d.v)}
                          className={cn(
                            "size-8 rounded-md border text-sm font-medium",
                            on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background text-muted-foreground",
                          )}
                        >
                          {d.l}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-sm">De</span>
                    <Input type="time" className="w-32" value={r.horaDesde} onChange={(e) => patch(r.key, { horaDesde: e.target.value })} />
                    <span className="text-muted-foreground text-sm">a</span>
                    <Input type="time" className="w-32" value={r.horaHasta} onChange={(e) => patch(r.key, { horaHasta: e.target.value })} />
                  </div>
                  <p className="text-muted-foreground text-xs">Déjalo vacío para que aplique a todas las clases. La hora es la de inicio.</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={agregar}>
        <Plus className="size-4" /> Agregar regla
      </Button>

      <div className="flex items-center gap-3 border-t pt-4">
        <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar compensación"}</Button>
        {state.error && <span className="text-destructive text-sm">{state.error}</span>}
        {state.ok && <span className="text-primary text-sm">{state.ok}</span>}
      </div>
    </form>
  );
}
