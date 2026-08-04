"use client";

import { useState, useRef, useEffect, useCallback, useTransition } from "react";
import { createPortal } from "react-dom";
import { buscarClientes } from "@/app/(app)/clientes/actions";
import { Input } from "@/components/ui/input";

type Sug = { id: number; nombres: string; apellidos: string; celular: string | null };

/** Buscador con autocompletar para elegir un cliente dentro de un formulario.
 *  Pone el id elegido en un input oculto (name) para que se envíe con el form.
 *
 *  ⚠️ La lista se pinta en un PORTAL sobre `document.body`, no como hija del input.
 *  El `Card` del sistema de diseño trae `overflow-hidden` (card.tsx), así que un
 *  desplegable en `absolute` queda RECORTADO al borde de la tarjeta: en los formularios
 *  que van al final de una Card —inscribir participante, conciliar, cierre— se veía
 *  media fila y no se podía elegir a nadie. Con el portal el componente ya no depende
 *  de que su contenedor no recorte, que es lo que hacía que el arreglo se tuviera que
 *  repetir en cada pantalla. */
export function ClienteAutocomplete({
  name = "clienteId",
  initialId,
  initialLabel,
  onSelect,
}: {
  name?: string;
  initialId?: number;
  initialLabel?: string;
  onSelect?: (id: number | null) => void;
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<{ id: number; label: string } | null>(
    initialId && initialLabel ? { id: initialId, label: initialLabel } : null,
  );
  const [sugs, setSugs] = useState<Sug[]>([]);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const [, start] = useTransition();
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

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

  /** Ancla la lista al input. Va en `fixed`, así que se recalcula al hacer scroll. */
  const medir = useCallback(() => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r) return;
    setPos({
      top: r.bottom + 4,
      left: r.left,
      width: r.width,
      // Si no cabe abajo, la lista se desplaza por dentro en vez de salirse de la pantalla.
      maxHeight: Math.max(160, window.innerHeight - r.bottom - 16),
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    medir();
    // `true` = fase de captura: también atrapa el scroll de contenedores internos.
    window.addEventListener("scroll", medir, true);
    window.addEventListener("resize", medir);
    return () => {
      window.removeEventListener("scroll", medir, true);
      window.removeEventListener("resize", medir);
    };
  }, [open, medir]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      // La lista vive fuera de boxRef (portal): sin excluirla, el mousedown la cerraría
      // ANTES de que el clic llegara al botón y no se podría seleccionar nada.
      if (boxRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  const elegir = (s: Sug) => {
    setSel({ id: s.id, label: `${s.apellidos}, ${s.nombres}` });
    setOpen(false);
    onSelect?.(s.id);
  };

  const visible = open && !sel && sugs.length > 0 && pos !== null;

  return (
    <div ref={boxRef} className="relative min-w-56">
      <input type="hidden" name={name} value={sel?.id ?? ""} />
      {sel ? (
        <div className="border-input flex h-9 items-center justify-between gap-2 rounded-md border bg-background px-3 text-sm">
          <span className="truncate">{sel.label}</span>
          <button type="button" onClick={() => { setSel(null); setQ(""); onSelect?.(null); }} className="text-muted-foreground hover:text-foreground shrink-0 text-xs underline">
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
      {visible &&
        createPortal(
          <ul
            ref={listRef}
            style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }}
            className="bg-popover z-50 overflow-y-auto rounded-md border shadow-md"
          >
            {sugs.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => elegir(s)}
                  className="hover:bg-muted flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm"
                >
                  <span className="truncate">{s.apellidos}, {s.nombres}</span>
                  {s.celular && <span className="text-muted-foreground shrink-0 text-xs">{s.celular}</span>}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  );
}
