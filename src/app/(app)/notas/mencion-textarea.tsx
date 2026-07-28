"use client";

import { useEffect, useRef, useState } from "react";
import { AtSign, X } from "lucide-react";
import { ROLE_LABEL } from "@/lib/roles";
import { cn } from "@/lib/utils";
import type { StaffMiembro } from "@/lib/database.types";

/** Texto de la mención tal como queda escrito en la nota: "@Laura Salazar". */
export function tokenMencion(m: StaffMiembro) {
  return `@${m.nombre ?? "compañero"}`;
}

/**
 * Área de texto con etiquetado por "@": al escribir @ aparece la lista del staff,
 * y al elegir a alguien se inserta su nombre y queda como responsable de la nota.
 * Los ids elegidos viajan en inputs ocultos (name="destinatario").
 */
export function MencionTextarea({
  staff,
  defaultTexto = "",
  defaultDestinatarios = [],
  placeholder,
  autoFocus,
  pistaSinEtiquetar = "Sin responsable: irá al tablón de todo el equipo",
}: {
  staff: StaffMiembro[];
  defaultTexto?: string;
  defaultDestinatarios?: string[];
  placeholder?: string;
  autoFocus?: boolean;
  /** Qué decir cuando no hay nadie etiquetado. `null` = no mostrar la fila. */
  pistaSinEtiquetar?: string | null;
}) {
  const [texto, setTexto] = useState(defaultTexto);
  const [elegidos, setElegidos] = useState<string[]>(defaultDestinatarios);
  const [query, setQuery] = useState<string | null>(null); // null = menú cerrado
  const [resaltado, setResaltado] = useState(0);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const cajaRef = useRef<HTMLDivElement>(null);

  const sugerencias =
    query === null
      ? []
      : staff
          .filter((m) => (m.nombre ?? "").toLowerCase().includes(query.toLowerCase()))
          .slice(0, 6);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (cajaRef.current && !cajaRef.current.contains(e.target as Node)) setQuery(null);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  /** Detecta si el cursor viene de escribir "@algo" y abre el menú. */
  function revisarMencion(valor: string, caret: number) {
    const previo = valor.slice(0, caret);
    const m = /(?:^|\s)@([^\s@]*)$/.exec(previo);
    setQuery(m ? m[1] : null);
    setResaltado(0);
  }

  function alEscribir(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setTexto(e.target.value);
    revisarMencion(e.target.value, e.target.selectionStart ?? e.target.value.length);
  }

  /** Reemplaza el "@loQueIbaEscribiendo" por el nombre completo y lo etiqueta. */
  function elegir(m: StaffMiembro) {
    const area = areaRef.current;
    const caret = area?.selectionStart ?? texto.length;
    const previo = texto.slice(0, caret);
    const inicio = previo.search(/(?:^|\s)@[^\s@]*$/);
    const desde = inicio === -1 ? previo.length : previo[inicio] === "@" ? inicio : inicio + 1;
    const nuevo = `${texto.slice(0, desde)}${tokenMencion(m)} ${texto.slice(caret)}`;
    setTexto(nuevo);
    setElegidos((prev) => (prev.includes(m.id) ? prev : [...prev, m.id]));
    setQuery(null);
    requestAnimationFrame(() => {
      const pos = desde + tokenMencion(m).length + 1;
      area?.focus();
      area?.setSelectionRange(pos, pos);
    });
  }

  function alTeclear(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (query === null || sugerencias.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setResaltado((i) => (i + 1) % sugerencias.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setResaltado((i) => (i - 1 + sugerencias.length) % sugerencias.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      elegir(sugerencias[resaltado]);
    } else if (e.key === "Escape") {
      setQuery(null);
    }
  }

  function quitar(id: string) {
    setElegidos((prev) => prev.filter((p) => p !== id));
  }

  const etiquetados = elegidos
    .map((id) => staff.find((m) => m.id === id))
    .filter((m): m is StaffMiembro => Boolean(m));

  return (
    <div ref={cajaRef} className="relative space-y-2">
      {elegidos.map((id) => (
        <input key={id} type="hidden" name="destinatario" value={id} />
      ))}

      <textarea
        ref={areaRef}
        name="texto"
        value={texto}
        onChange={alEscribir}
        onKeyDown={alTeclear}
        onClick={(e) => revisarMencion(texto, e.currentTarget.selectionStart ?? 0)}
        rows={3}
        maxLength={2000}
        autoFocus={autoFocus}
        placeholder={placeholder ?? "Escribe el recado… usa @ para asignarle la nota a alguien"}
        className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 w-full resize-y rounded-lg border bg-transparent px-3 py-2 text-base shadow-2xs transition-[color,box-shadow,border-color] outline-none focus-visible:ring-3 md:text-sm"
      />

      {query !== null && sugerencias.length > 0 && (
        <ul className="bg-popover absolute top-full right-0 left-0 z-30 -mt-1 overflow-hidden rounded-lg border shadow-md">
          {sugerencias.map((m, i) => (
            <li key={m.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => elegir(m)}
                onMouseEnter={() => setResaltado(i)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm",
                  i === resaltado && "bg-muted",
                )}
              >
                <span className="truncate font-medium">{m.nombre ?? "Sin nombre"}</span>
                <span className="text-muted-foreground shrink-0 text-xs">{ROLE_LABEL[m.role]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {(etiquetados.length > 0 || pistaSinEtiquetar !== null) && (
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
          <AtSign className="size-3.5" />
          {etiquetados.length === 0 ? pistaSinEtiquetar : "Responsables:"}
        </span>
        {etiquetados.map((m) => (
          <span
            key={m.id}
            className="bg-primary/15 text-charcoal ring-primary/25 inline-flex items-center gap-1 rounded-4xl px-2 py-0.5 text-xs font-medium ring-1"
          >
            {m.nombre ?? "Sin nombre"}
            <button
              type="button"
              onClick={() => quitar(m.id)}
              className="hover:text-destructive"
              aria-label={`Quitar a ${m.nombre ?? "esta persona"}`}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
      </div>
      )}
    </div>
  );
}

/**
 * Parte el texto de la nota para pintar las menciones destacadas.
 * Se compara contra los nombres realmente etiquetados (no contra cualquier @)
 * para que "@Ana María" no quede cortado en "@Ana".
 */
export function partirMenciones(
  texto: string,
  nombres: string[],
): { texto: string; mencion: boolean }[] {
  const limpios = nombres.filter(Boolean).sort((a, b) => b.length - a.length);
  if (limpios.length === 0) return [{ texto, mencion: false }];
  const patron = limpios.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const re = new RegExp(`@(?:${patron})`, "g");

  const partes: { texto: string; mencion: boolean }[] = [];
  let ultimo = 0;
  for (const m of texto.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > ultimo) partes.push({ texto: texto.slice(ultimo, i), mencion: false });
    partes.push({ texto: m[0], mencion: true });
    ultimo = i + m[0].length;
  }
  if (ultimo < texto.length) partes.push({ texto: texto.slice(ultimo), mencion: false });
  return partes;
}
