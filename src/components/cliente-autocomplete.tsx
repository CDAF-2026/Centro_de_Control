"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { buscarClientes } from "@/app/(app)/clientes/actions";
import { Input } from "@/components/ui/input";

type Sug = { id: number; nombres: string; apellidos: string; celular: string | null };

/** Buscador con autocompletar para elegir un cliente dentro de un formulario.
 *  Pone el id elegido en un input oculto (name) para que se envíe con el form. */
export function ClienteAutocomplete({
  name = "clienteId",
  initialId,
  initialLabel,
}: {
  name?: string;
  initialId?: number;
  initialLabel?: string;
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<{ id: number; label: string } | null>(
    initialId && initialLabel ? { id: initialId, label: initialLabel } : null,
  );
  const [sugs, setSugs] = useState<Sug[]>([]);
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sel || q.trim().length < 2) {
      setSugs([]);
      return;
    }
    const t = setTimeout(() => {
      start(async () => {
        setSugs(await buscarClientes(q));
        setOpen(true);
      });
    }, 250);
    return () => clearTimeout(t);
  }, [q, sel]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  return (
    <div ref={boxRef} className="relative min-w-56">
      <input type="hidden" name={name} value={sel?.id ?? ""} />
      {sel ? (
        <div className="border-input flex h-9 items-center justify-between gap-2 rounded-md border bg-background px-3 text-sm">
          <span className="truncate">{sel.label}</span>
          <button type="button" onClick={() => { setSel(null); setQ(""); }} className="text-muted-foreground hover:text-foreground shrink-0 text-xs underline">
            cambiar
          </button>
        </div>
      ) : (
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => sugs.length > 0 && setOpen(true)}
          placeholder="Escribe el nombre…"
          autoComplete="off"
        />
      )}
      {open && !sel && sugs.length > 0 && (
        <ul className="bg-popover absolute z-20 mt-1 w-full overflow-hidden rounded-md border shadow-md">
          {sugs.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => { setSel({ id: s.id, label: `${s.apellidos}, ${s.nombres}` }); setOpen(false); }}
                className="hover:bg-muted flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm"
              >
                <span className="truncate">{s.apellidos}, {s.nombres}</span>
                {s.celular && <span className="text-muted-foreground shrink-0 text-xs">{s.celular}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
