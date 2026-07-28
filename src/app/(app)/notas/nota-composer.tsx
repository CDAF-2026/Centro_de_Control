"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Link2, Send, TriangleAlert } from "lucide-react";
import { crearNota, type NotaState } from "./actions";
import { MencionTextarea } from "./mencion-textarea";
import { ClienteAutocomplete } from "@/components/cliente-autocomplete";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { StaffMiembro } from "@/lib/database.types";

const inicial: NotaState = {};

export type OpcionEnlace = { id: number; label: string };

type TipoEnlace = "" | "cliente" | "clase" | "evento";

export function NotaComposer({
  staff,
  clases,
  eventos,
}: {
  staff: StaffMiembro[];
  clases: OpcionEnlace[];
  eventos: OpcionEnlace[];
}) {
  const [state, action, pending] = useActionState(crearNota, inicial);
  const [urgente, setUrgente] = useState(false);
  const [tipo, setTipo] = useState<TipoEnlace>("");
  const [clave, setClave] = useState(0); // fuerza el remonte del formulario al enviar
  const formRef = useRef<HTMLFormElement>(null);

  // Tras guardar, deja el formulario limpio para el siguiente recado.
  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setUrgente(false);
      setTipo("");
      setClave((k) => k + 1);
    }
  }, [state.ok]);

  return (
    <form
      ref={formRef}
      action={action}
      className="bg-card border-border space-y-3 rounded-xl border p-4 shadow-sm"
    >
      <MencionTextarea key={clave} staff={staff} />

      <div className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="prioridad" value={urgente ? "alta" : "normal"} />
        <Button
          type="button"
          variant={urgente ? "default" : "outline"}
          size="sm"
          onClick={() => setUrgente((u) => !u)}
          aria-pressed={urgente}
        >
          <TriangleAlert className={cn("size-3.5", urgente && "text-primary-foreground")} />
          Urgente
        </Button>

        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoEnlace)}
          aria-label="Enganchar la nota a"
          className="border-input bg-background h-8 rounded-lg border px-2 text-xs"
        >
          <option value="">Sin enganche</option>
          <option value="cliente">Sobre un cliente</option>
          <option value="clase">Sobre una clase</option>
          <option value="evento">Sobre un evento</option>
        </select>

        {tipo === "cliente" && (
          <div key={`cli-${clave}`} className="min-w-56">
            <ClienteAutocomplete name="cliente_id" />
          </div>
        )}
        {tipo === "clase" && (
          <select
            name="clase_id"
            aria-label="Clase"
            className="border-input bg-background h-8 max-w-64 rounded-lg border px-2 text-xs"
          >
            <option value="">— Elige la clase —</option>
            {clases.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        )}
        {tipo === "evento" && (
          <select
            name="evento_id"
            aria-label="Evento"
            className="border-input bg-background h-8 max-w-64 rounded-lg border px-2 text-xs"
          >
            <option value="">— Elige el evento —</option>
            {eventos.map((e) => (
              <option key={e.id} value={e.id}>{e.label}</option>
            ))}
          </select>
        )}

        <Button type="submit" size="sm" disabled={pending} className="ml-auto">
          <Send className="size-3.5" />
          {pending ? "Enviando…" : "Dejar la nota"}
        </Button>
      </div>

      {tipo !== "" && (
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <Link2 className="size-3" />
          La nota quedará enlazada y también se verá desde esa ficha.
        </p>
      )}
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      {state.ok && <p className="text-sm font-medium text-[#46530a]">{state.ok}</p>}
    </form>
  );
}
