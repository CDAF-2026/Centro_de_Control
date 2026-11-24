"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LectorLineas, type LineaChat, type MensajeVista } from "@/lib/agente/protocolo";

/**
 * El estado de una conversación con el Agente CDAF y el envío de preguntas a
 * `/agente/chat` (respuesta por partes). Lo usan las dos caras del agente: la
 * pantalla completa (`/agente`) y la mascota flotante (`mascota.tsx`).
 */

export type EnCurso = {
  /** La pregunta mientras el servidor no la ha guardado. */
  pendiente: string | null;
  /** Qué está consultando ahora ("Revisando la cartera…"). */
  etiqueta: string | null;
  texto: string;
};

export function useChatAgente(opts: {
  conversacionId: number | null;
  mensajesIniciales: MensajeVista[];
  /** El servidor creó la conversación (la primera pregunta de una nueva). */
  alCrear?: (id: number) => void;
  /** Terminó una pregunta que sí alcanzó a guardarse (con respuesta o con error). */
  alTerminar?: () => void;
}) {
  const [mensajes, setMensajes] = useState(opts.mensajesIniciales);
  const [convId, setConvId] = useState(opts.conversacionId);
  const [enCurso, setEnCurso] = useState<EnCurso | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [borrador, setBorrador] = useState("");
  // Las funciones de quien usa el hook cambian en cada render: se guardan después de
  // pintar y se leen al usarlas (siempre más tarde, cuando llega la respuesta).
  const avisos = useRef(opts);
  useEffect(() => {
    avisos.current = opts;
  });
  // Para no mandar dos preguntas a la vez desde dos clics seguidos.
  const ocupado = useRef(false);

  /** Cambiar de conversación (la mascota: "Nueva conversación" o retomar la guardada). */
  const cargar = useCallback((id: number | null, lista: MensajeVista[]) => {
    if (ocupado.current) return;
    setConvId(id);
    setMensajes(lista);
    setError(null);
  }, []);

  const enviar = useCallback(
    async (texto: string) => {
      const pregunta = texto.trim();
      if (!pregunta || ocupado.current) return;
      ocupado.current = true;
      setError(null);
      setBorrador("");
      setEnCurso({ pendiente: pregunta, etiqueta: null, texto: "" });

      let empezo = false;
      let id = convId;
      const aplicar = (l: LineaChat) => {
        switch (l.tipo) {
          case "inicio":
            empezo = true;
            setMensajes((m) => [...m, l.pregunta]);
            setEnCurso((e) => e && { ...e, pendiente: null });
            if (id == null) {
              id = l.conversacionId;
              setConvId(l.conversacionId);
              avisos.current.alCrear?.(l.conversacionId);
            }
            break;
          case "consultando":
            setEnCurso((e) => e && { ...e, etiqueta: l.etiqueta });
            break;
          case "texto":
            setEnCurso((e) => e && { ...e, texto: e.texto + l.delta });
            break;
          case "texto_descartado":
            setEnCurso((e) => e && { ...e, texto: "" });
            break;
          case "fin":
            setMensajes((m) => [...m, l.respuesta]);
            break;
          case "error":
            setError(l.mensaje);
            break;
        }
      };

      try {
        const res = await fetch("/agente/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pregunta, conversacionId: convId }),
        });
        if (!res.ok || !res.body) {
          const j = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(j?.error ?? "No se pudo enviar la pregunta.");
        }
        const lector = new LectorLineas();
        const reader = res.body.getReader();
        const decodificador = new TextDecoder();
        for (;;) {
          const { value, done } = await reader.read();
          const lineas = done ? lector.terminar() : lector.agregar(decodificador.decode(value, { stream: true }));
          lineas.forEach(aplicar);
          if (done) break;
        }
      } catch (e) {
        setError(e instanceof Error && e.message ? e.message : "Se perdió la conexión. Inténtalo de nuevo.");
        // Si ni siquiera se guardó, la pregunta vuelve a la caja para no perderla.
        if (!empezo) setBorrador(pregunta);
      } finally {
        ocupado.current = false;
        setEnCurso(null);
        if (empezo) avisos.current.alTerminar?.();
      }
    },
    [convId],
  );

  return { mensajes, convId, enCurso, error, borrador, setBorrador, enviar, cargar };
}
