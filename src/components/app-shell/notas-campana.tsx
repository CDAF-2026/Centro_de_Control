"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, StickyNote, TriangleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  contarNoLeidasAction,
  notasNoLeidasAction,
  type NotaAviso,
} from "@/app/(app)/notas/actions";
import { fechaHoraCorta } from "@/lib/fecha";
import { cn } from "@/lib/utils";

/**
 * Campanita de notas: contador de recados sin abrir + desplegable con el detalle.
 *
 * El número llega calculado desde el servidor y se mantiene al día por Realtime:
 * el navegador escucha SOLO sus propias filas de `nota_destinatarios`, así que
 * cuando alguien le deja una nota el contador sube sin recargar la página.
 */
export function NotasCampana({
  perfilId,
  inicial,
}: {
  perfilId: string;
  inicial: number;
}) {
  const [conteo, setConteo] = useState(inicial);
  const [abierto, setAbierto] = useState(false);
  const [avisos, setAvisos] = useState<NotaAviso[] | null>(null);
  const [reciente, setReciente] = useState<string | null>(null);
  const cajaRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // El servidor manda: cada navegación trae el número recalculado.
  useEffect(() => setConteo(inicial), [inicial]);

  const refrescar = useCallback(async () => {
    try {
      setConteo(await contarNoLeidasAction());
    } catch {
      // Sesión vencida o sin red: se corrige en la siguiente navegación.
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const canal = supabase
      .channel(`notas-${perfilId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "nota_destinatarios",
          filter: `perfil_id=eq.${perfilId}`,
        },
        (payload) => {
          void refrescar();
          if (payload.eventType === "INSERT") {
            setAvisos(null); // el desplegable se recarga al abrirlo
            setReciente("Te dejaron una nota nueva");
            router.refresh();
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(canal);
    };
  }, [perfilId, refrescar, router]);

  // El aviso emergente se va solo.
  useEffect(() => {
    if (!reciente) return;
    const t = setTimeout(() => setReciente(null), 6000);
    return () => clearTimeout(t);
  }, [reciente]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (cajaRef.current && !cajaRef.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  async function alternar() {
    const nuevo = !abierto;
    setAbierto(nuevo);
    if (nuevo && avisos === null) {
      try {
        setAvisos(await notasNoLeidasAction());
      } catch {
        setAvisos([]);
      }
    }
  }

  return (
    <>
      <div ref={cajaRef} className="relative">
        <button
          type="button"
          onClick={alternar}
          aria-label={conteo > 0 ? `Notas: ${conteo} sin abrir` : "Notas"}
          aria-expanded={abierto}
          className="text-muted-foreground hover:text-foreground hover:bg-muted relative flex size-9 items-center justify-center rounded-lg transition-colors"
        >
          <Bell className="size-5" />
          {conteo > 0 && (
            <span className="bg-primary text-primary-foreground ring-card absolute -top-0.5 -right-0.5 flex min-w-4.5 items-center justify-center rounded-full px-1 text-[10px] leading-4 font-bold ring-2">
              {conteo > 9 ? "9+" : conteo}
            </span>
          )}
        </button>

        {abierto && (
          <div className="bg-popover absolute right-0 z-40 mt-2 w-[min(88vw,22rem)] overflow-hidden rounded-xl border shadow-lg">
            <div className="border-border flex items-center justify-between border-b px-3 py-2">
              <p className="text-sm font-semibold">Notas sin abrir</p>
              <Link
                href="/notas?filtro=mias"
                onClick={() => setAbierto(false)}
                className="text-muted-foreground hover:text-foreground text-xs underline"
              >
                Ver todas
              </Link>
            </div>
            <ul className="max-h-80 overflow-y-auto">
              {avisos === null && (
                <li className="text-muted-foreground px-3 py-6 text-center text-sm">Cargando…</li>
              )}
              {avisos?.length === 0 && (
                <li className="text-muted-foreground px-3 py-6 text-center text-sm">
                  Estás al día. No tienes notas sin abrir.
                </li>
              )}
              {avisos?.map((a) => (
                <li key={a.id} className="border-border border-b last:border-0">
                  <Link
                    href="/notas?filtro=mias"
                    onClick={() => setAbierto(false)}
                    className="hover:bg-muted block px-3 py-2.5"
                  >
                    <p className="flex items-center gap-1.5 text-xs">
                      {a.prioridad === "alta" && (
                        <TriangleAlert className="text-warning size-3.5 shrink-0" />
                      )}
                      <span className="text-foreground font-medium">{a.autorNombre}</span>
                      <span className="text-muted-foreground">
                        {a.paraTodos ? "· para todo el equipo" : "· te etiquetó"}
                      </span>
                    </p>
                    <p className="text-foreground mt-0.5 line-clamp-2 text-sm">{a.texto}</p>
                    <p className="text-muted-foreground mt-0.5 text-[11px]">
                      {fechaHoraCorta(a.createdAt)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {reciente && (
        <div className="fixed top-4 left-1/2 z-50 w-[min(92vw,24rem)] -translate-x-1/2">
          <Link
            href="/notas?filtro=mias"
            onClick={() => setReciente(null)}
            className={cn(
              "bg-card border-border border-l-primary flex items-start gap-3 rounded-lg border border-l-4 px-4 py-3 shadow-lg",
              "animate-in fade-in slide-in-from-top-2",
            )}
          >
            <StickyNote className="text-primary mt-0.5 size-5 shrink-0" />
            <span className="flex-1">
              <span className="block text-sm font-semibold">{reciente}</span>
              <span className="text-muted-foreground block text-xs">Toca para abrir la bandeja.</span>
            </span>
          </Link>
        </div>
      )}
    </>
  );
}
