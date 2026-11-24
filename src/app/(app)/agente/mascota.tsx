"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LoaderCircle, Maximize2, SquarePen, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MensajeVista } from "@/lib/agente/protocolo";
import { CajaPregunta, ListaMensajes, Mascota, NOMBRE_AGENTE } from "./piezas";
import { useChatAgente } from "./use-chat-agente";

/**
 * La mascota del Agente CDAF (24-nov-2026, pedido de Laura): un botón flotante en
 * todas las pantallas que abre el chat como en las páginas web, sin tener que ir
 * al módulo. Solo para quien tiene el agente (el layout decide si se pinta).
 *
 * Vive en el layout de la plataforma: al cambiar de pantalla NO se desmonta, así
 * que la conversación (y una respuesta que siga llegando) se conserva. Si la página
 * se recarga, retoma la conversación de esta pestaña (sessionStorage + GET).
 * En `/agente` no se pinta: ahí ya está el chat en grande.
 */

const CLAVE = "agente-cdaf:conversacion";

function guardarId(id: number | null) {
  try {
    if (id == null) sessionStorage.removeItem(CLAVE);
    else sessionStorage.setItem(CLAVE, String(id));
  } catch {
    // Navegación privada sin almacenamiento: solo se pierde retomar tras recargar.
  }
}

/**
 * En el celular, el teclado tapa media pantalla y una ventana fija abajo quedaría
 * detrás de él (en iPhone la página no se encoge: se encoge solo la parte VISIBLE).
 * Mientras el teclado está abierto, devuelve cuánto dejar arriba y abajo para que la
 * ventana quepa justo en lo que se ve. En computador, o sin teclado, null.
 */
function useAreaConTeclado(activo: boolean) {
  const [area, setArea] = useState<{ arriba: number; abajo: number } | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!activo || !vv) return;
    const medir = () => {
      const tapado = window.innerHeight - vv.height;
      if (window.innerWidth >= 640 || tapado < 120) setArea(null);
      else setArea({ arriba: vv.offsetTop, abajo: Math.max(window.innerHeight - vv.offsetTop - vv.height, 0) });
    };
    const primera = requestAnimationFrame(medir);
    vv.addEventListener("resize", medir);
    vv.addEventListener("scroll", medir);
    return () => {
      cancelAnimationFrame(primera);
      vv.removeEventListener("resize", medir);
      vv.removeEventListener("scroll", medir);
    };
  }, [activo]);
  return activo ? area : null;
}

async function leerMensajes(id: number): Promise<MensajeVista[] | null> {
  const r = await fetch(`/agente/chat?c=${id}`, { cache: "no-store" });
  if (!r.ok) return null;
  return ((await r.json()) as { mensajes: MensajeVista[] }).mensajes;
}

export function MascotaAgente() {
  const pathname = usePathname();
  const enPantallaCompleta = pathname === "/agente" || pathname.startsWith("/agente/");
  const [abierta, setAbierta] = useState(false);
  /** Llegó una respuesta que nadie ha visto: la mascota lo avisa con un punto si está cerrada. */
  const [sinLeer, setSinLeer] = useState(false);
  const [cargando, setCargando] = useState(false);
  const teclado = useAreaConTeclado(abierta);

  const chat = useChatAgente({
    conversacionId: null,
    mensajesIniciales: [],
    alCrear: guardarId,
    alTerminar: () => setSinLeer(true),
  });
  const { cargar, convId, enCurso } = chat;

  // Retomar la conversación de esta pestaña la primera vez que se abre (tras recargar la página).
  const retomada = useRef(false);
  function abrirOCerrar() {
    // Abrir o cerrar es mirar la ventana: lo que llegó ya se vio (o se verá ahora).
    setSinLeer(false);
    if (abierta) return setAbierta(false);
    setAbierta(true);
    if (retomada.current || convId != null) return;
    retomada.current = true;
    let id: number | null = null;
    try {
      id = Number(sessionStorage.getItem(CLAVE)) || null;
    } catch {}
    if (!id) return;
    const guardada = id;
    setCargando(true);
    leerMensajes(guardada)
      .then((m) => (m ? cargar(guardada, m) : guardarId(null)))
      .catch(() => {})
      .finally(() => setCargando(false));
  }

  // Al volver de la pantalla completa: la conversación pudo seguir allá, se pone al día.
  const antes = useRef(enPantallaCompleta);
  useEffect(() => {
    const venia = antes.current;
    antes.current = enPantallaCompleta;
    if (venia && !enPantallaCompleta && convId != null && !enCurso) {
      leerMensajes(convId)
        .then((m) => m && cargar(convId, m))
        .catch(() => {});
    }
  }, [enPantallaCompleta, convId, enCurso, cargar]);

  // Esc cierra la ventana.
  useEffect(() => {
    if (!abierta) return;
    const alTeclear = (e: KeyboardEvent) => e.key === "Escape" && setAbierta(false);
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [abierta]);

  if (enPantallaCompleta) return null;

  const aviso = !abierta && (sinLeer || !!enCurso);

  return (
    <>
      {abierta && (
        <div
          role="dialog"
          aria-label={NOMBRE_AGENTE}
          // Celular (opción A que escogió Laura, 24-nov-2026): ventana flotante con márgenes,
          // debajo del encabezado y encima de la mascota, que queda visible para cerrarla.
          // Computador: 25rem de ancho, abajo a la derecha.
          className="bg-card animate-in fade-in slide-in-from-bottom-2 fixed inset-x-3 top-16 bottom-24 z-30 flex flex-col overflow-hidden rounded-2xl shadow-xl ring-1 ring-foreground/[0.08] duration-200 sm:inset-x-auto sm:top-auto sm:right-6 sm:bottom-24 sm:h-[min(40rem,calc(100dvh-8rem))] sm:w-[25rem]"
          style={teclado ? { top: teclado.arriba + 8, bottom: teclado.abajo + 8 } : undefined}
        >
          <header className="bg-stadium flex items-center gap-3 px-4 py-3 text-white">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15">
              <Mascota tam={36} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-heading text-sm font-semibold">{NOMBRE_AGENTE}</p>
              <p className="text-xs text-white/60">{enCurso ? "Consultando los datos…" : "Pregúntame por el club"}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                cargar(null, []);
                guardarId(null);
              }}
              disabled={!!enCurso}
              title="Nueva conversación"
              aria-label="Nueva conversación"
              className="flex size-8 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
            >
              <SquarePen className="size-4" />
            </button>
            <Link
              href={convId ? `/agente?c=${convId}` : "/agente"}
              // Cerrada: al volver de la pantalla completa no debe reaparecer abierta.
              onClick={() => setAbierta(false)}
              title="Ver en pantalla completa"
              aria-label="Ver en pantalla completa"
              className="flex size-8 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <Maximize2 className="size-4" />
            </Link>
            <button
              type="button"
              onClick={abrirOCerrar}
              title="Cerrar"
              aria-label="Cerrar"
              className="flex size-8 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="size-4" />
            </button>
          </header>

          {cargando ? (
            <p className="text-muted-foreground flex flex-1 items-center justify-center gap-2 text-sm">
              <LoaderCircle className="size-4 animate-spin" />
              Cargando la conversación…
            </p>
          ) : (
            <ListaMensajes compacta mensajes={chat.mensajes} enCurso={enCurso} error={chat.error} alElegir={chat.enviar} />
          )}
          <CajaPregunta
            compacta
            autoFocus
            valor={chat.borrador}
            alCambiar={chat.setBorrador}
            alEnviar={() => chat.enviar(chat.borrador)}
            ocupado={!!enCurso || cargando}
          />
        </div>
      )}

      <button
        type="button"
        onClick={abrirOCerrar}
        aria-label={abierta ? `Cerrar el ${NOMBRE_AGENTE}` : `Abrir el ${NOMBRE_AGENTE}`}
        aria-expanded={abierta}
        title={NOMBRE_AGENTE}
        className={cn(
          "fixed right-4 bottom-4 z-30 size-16 rounded-full transition-transform duration-200 hover:scale-105 active:scale-95 sm:right-6 sm:bottom-6",
          "focus-visible:ring-ring/60 outline-none focus-visible:ring-4",
          // Con el teclado abierto la mascota quedaría debajo de él: se esconde mientras se escribe.
          teclado && "hidden",
        )}
      >
        <Mascota tam={64} className="drop-shadow-[0_6px_14px_rgba(26,28,30,0.35)]" />
        {aviso && (
          <span
            aria-hidden
            className={cn("bg-primary ring-background absolute top-0.5 right-0.5 size-3.5 rounded-full ring-2", enCurso && "animate-pulse")}
          />
        )}
      </button>
    </>
  );
}
