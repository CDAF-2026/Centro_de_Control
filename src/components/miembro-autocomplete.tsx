"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { buscarMiembros } from "@/app/(app)/clientes/actions";
import { Input } from "@/components/ui/input";

type Sug = { id: number; clienteId: number; nombres: string; apellidos: string; esTitular: boolean; ficha: string | null };

/**
 * Busca una PERSONA (miembro/hermano) por su propio nombre y, al elegirla, deja
 * en inputs ocultos su miembro_id y el cliente_id de su ficha familiar. Así se
 * inscribe directo sin tener que buscar primero al titular de la cuenta.
 */
export function MiembroAutocomplete({
  miembroName = "miembroId",
  clienteName = "clienteId",
}: {
  miembroName?: string;
  clienteName?: string;
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<{ id: number; clienteId: number; label: string } | null>(null);
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
        setSugs(await buscarMiembros(q));
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
      <input type="hidden" name={miembroName} value={sel?.id ?? ""} />
      <input type="hidden" name={clienteName} value={sel?.clienteId ?? ""} />
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
                onClick={() => { setSel({ id: s.id, clienteId: s.clienteId, label: `${s.apellidos}, ${s.nombres}` }); setOpen(false); }}
                className="hover:bg-muted flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left text-sm"
              >
                <span className="truncate">{s.apellidos}, {s.nombres}</span>
                {!s.esTitular && s.ficha && (
                  <span className="text-muted-foreground text-xs">cuenta de {s.ficha}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
