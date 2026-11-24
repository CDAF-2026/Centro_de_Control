"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { ArrowUp, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MensajeVista } from "@/lib/agente/protocolo";
import { ComoLoCalcule, Respuesta } from "./respuesta";
import type { EnCurso } from "./use-chat-agente";

/**
 * Las piezas del chat del Agente CDAF, compartidas por la pantalla completa y la
 * mascota flotante. `compacta` = la ventana de la mascota (más pequeña).
 */

/** Nombre decidido por Laura (24-nov-2026). */
export const NOMBRE_AGENTE = "Agente CDAF";

/** Las preguntas de Laura para el banco de pruebas (24-nov-2026): las que de verdad le harían. */
export const SUGERENCIAS = [
  "¿Por qué bajaron mis ingresos este mes?",
  "¿Cuáles son los servicios más exitosos del club?",
  "¿Qué debería dejar de vender en la cafetería por poca rotación?",
  "¿Qué horarios convienen para sacar promociones?",
];

export function Mascota({ tam, className }: { tam: number; className?: string }) {
  return (
    <Image
      src="/agente/mascota.png"
      alt=""
      width={tam}
      height={tam}
      className={cn("pointer-events-none select-none", className)}
      draggable={false}
    />
  );
}

function AvatarAgente({ compacta }: { compacta?: boolean }) {
  const tam = compacta ? 28 : 32;
  return (
    <span className="bg-stadium flex shrink-0 items-center justify-center rounded-full" style={{ width: tam, height: tam }}>
      <Mascota tam={tam - 4} />
    </span>
  );
}

export function Pregunta({ texto }: { texto: string }) {
  return (
    <div className="flex justify-end">
      <p className="bg-muted max-w-[85%] rounded-xl px-4 py-2.5 text-sm whitespace-pre-wrap">{texto}</p>
    </div>
  );
}

export function MensajeAgente({ mensaje, compacta }: { mensaje: MensajeVista; compacta?: boolean }) {
  return (
    <div className={cn("flex", compacta ? "gap-2" : "gap-3")}>
      <AvatarAgente compacta={compacta} />
      <div className="min-w-0 flex-1 pt-1">
        <Respuesta texto={mensaje.contenido} />
        <ComoLoCalcule fuentes={mensaje.fuentes} />
      </div>
    </div>
  );
}

export function Bienvenida({ alElegir, compacta }: { alElegir: (s: string) => void; compacta?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      <Mascota tam={compacta ? 88 : 104} />
      <div className="space-y-1">
        <p className="font-heading text-sm font-semibold">¡Hola! Soy el {NOMBRE_AGENTE}.</p>
        <p className="text-muted-foreground mx-auto max-w-md text-sm">
          Pregúntame por ingresos, cartera, clientes, academias, clases, entrenadores, cafetería u ocupación de las canchas.
        </p>
      </div>
      <div className={cn("flex flex-wrap justify-center gap-2", compacta ? "max-w-sm" : "max-w-2xl")}>
        {SUGERENCIAS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => alElegir(s)}
            className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-full border px-3 py-1.5 text-left text-xs transition-colors"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * La lista de mensajes con su desplazamiento: al abrir y mientras llega la
 * respuesta va al final, de un salto (uno suave se cortaba cuando el markdown
 * terminaba de pintarse), y deja de seguir si la persona sube a leer.
 * Cuando la caja no tiene alto fijo (pantalla completa en celular) lo que se
 * mueve es la página: ahí solo se sigue la respuesta en curso.
 */
export function ListaMensajes({
  mensajes,
  enCurso,
  error,
  alElegir,
  compacta,
}: {
  mensajes: MensajeVista[];
  enCurso: EnCurso | null;
  error: string | null;
  alElegir: (s: string) => void;
  compacta?: boolean;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const fin = useRef<HTMLDivElement>(null);
  const seguir = useRef(true);
  const preguntando = !!enCurso;

  useEffect(() => {
    if (preguntando) seguir.current = true;
  }, [preguntando]);

  useEffect(() => {
    const c = caja.current;
    if (!c || !seguir.current) return;
    if (c.scrollHeight > c.clientHeight + 1) c.scrollTop = c.scrollHeight;
    else if (enCurso) fin.current?.scrollIntoView({ block: "end" });
  }, [mensajes, enCurso]);

  const vacia = mensajes.length === 0 && !enCurso;

  return (
    <div
      ref={caja}
      onScroll={(e) => {
        const c = e.currentTarget;
        seguir.current = c.scrollHeight - c.scrollTop - c.clientHeight < 120;
      }}
      className={cn(
        "flex-1 overflow-y-auto",
        compacta ? "space-y-5 p-4" : "space-y-6 p-4 md:p-6",
        vacia && "flex flex-col justify-center",
      )}
    >
      {vacia && <Bienvenida alElegir={alElegir} compacta={compacta} />}

      {mensajes.map((m) =>
        m.rol === "usuario" ? <Pregunta key={m.id} texto={m.contenido} /> : <MensajeAgente key={m.id} mensaje={m} compacta={compacta} />,
      )}

      {enCurso?.pendiente && <Pregunta texto={enCurso.pendiente} />}
      {enCurso && (
        <div className={cn("flex", compacta ? "gap-2" : "gap-3")}>
          <AvatarAgente compacta={compacta} />
          <div className="min-w-0 flex-1 pt-1">
            {enCurso.texto ? (
              <Respuesta texto={enCurso.texto} />
            ) : (
              <p className="text-muted-foreground flex items-center gap-2 text-sm">
                <LoaderCircle className="size-4 animate-spin" />
                {enCurso.etiqueta ?? "Pensando…"}
              </p>
            )}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm">
          {error}
        </p>
      )}
      <div ref={fin} />
    </div>
  );
}

export function CajaPregunta({
  valor,
  alCambiar,
  alEnviar,
  ocupado,
  compacta,
  autoFocus,
}: {
  valor: string;
  alCambiar: (v: string) => void;
  alEnviar: () => void;
  ocupado: boolean;
  compacta?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <form
      className={cn("border-border flex items-end gap-2 border-t", compacta ? "p-3" : "p-3 md:p-4")}
      onSubmit={(e) => {
        e.preventDefault();
        alEnviar();
      }}
    >
      <textarea
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
        onKeyDown={(e) => {
          // Enter envía; Shift+Enter hace un salto de línea.
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            alEnviar();
          }
        }}
        // Al abrir la ventana de la mascota se escribe de una.
        autoFocus={autoFocus}
        rows={compacta ? 1 : 2}
        maxLength={4000}
        placeholder="Pregunta sobre el club…"
        aria-label="Pregunta"
        className={cn(
          "border-input bg-background focus-visible:ring-ring/50 max-h-40 flex-1 resize-none rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-3",
          compacta ? "min-h-[2.5rem]" : "min-h-[2.75rem] resize-y",
        )}
      />
      {compacta ? (
        <Button type="submit" size="icon" disabled={ocupado || !valor.trim()} aria-label="Preguntar">
          {ocupado ? <LoaderCircle className="animate-spin" /> : <ArrowUp />}
        </Button>
      ) : (
        <Button type="submit" size="lg" disabled={ocupado || !valor.trim()}>
          {ocupado ? <LoaderCircle className="animate-spin" /> : <ArrowUp />}
          Preguntar
        </Button>
      )}
    </form>
  );
}
