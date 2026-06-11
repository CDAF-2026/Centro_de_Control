"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buscarClientes } from "./actions";
import { Input } from "@/components/ui/input";

type Sug = { id: number; nombres: string; apellidos: string; celular: string | null };

export function ClienteBuscador({ defaultValue = "" }: { defaultValue?: string }) {
  const router = useRouter();
  const [q, setQ] = useState(defaultValue);
  const [sugs, setSugs] = useState<Sug[]>([]);
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setSugs([]);
      return;
    }
    const t = setTimeout(() => {
      start(async () => {
        const r = await buscarClientes(q);
        setSugs(r);
        setOpen(true);
      });
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  return (
    <div ref={boxRef} className="relative w-full max-w-xs">
      <Input
        name="q"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => sugs.length > 0 && setOpen(true)}
        placeholder="Buscar por nombre o documento…"
        autoComplete="off"
      />
      {open && sugs.length > 0 && (
        <ul className="bg-popover absolute z-20 mt-1 w-full overflow-hidden rounded-md border shadow-md">
          {sugs.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  router.push(`/clientes/${s.id}`);
                }}
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
