"use client";

import { useRouter } from "next/navigation";
import type { MensajeVista } from "@/lib/agente/protocolo";
import { CajaPregunta, ListaMensajes } from "./piezas";
import { useChatAgente } from "./use-chat-agente";

/**
 * El chat en la pantalla completa `/agente` (la otra cara es la mascota flotante).
 *
 * Al empezar una conversación la dirección pasa a `?c=<id>` sin navegar (para no
 * cortar la respuesta), y al terminar se refresca la página para que la lista de
 * la izquierda quede al día.
 */
export function AgenteChat({
  conversacionId,
  mensajesIniciales,
}: {
  conversacionId: number | null;
  mensajesIniciales: MensajeVista[];
}) {
  const router = useRouter();
  const chat = useChatAgente({
    conversacionId,
    mensajesIniciales,
    alCrear: (id) => window.history.replaceState(null, "", `/agente?c=${id}`),
    alTerminar: () => router.refresh(),
  });

  return (
    <section className="bg-card flex min-h-[32rem] flex-col rounded-xl shadow-sm ring-1 ring-foreground/[0.06] lg:h-[calc(100dvh-14rem)]">
      <ListaMensajes mensajes={chat.mensajes} enCurso={chat.enCurso} error={chat.error} alElegir={chat.enviar} />
      <CajaPregunta
        valor={chat.borrador}
        alCambiar={chat.setBorrador}
        alEnviar={() => chat.enviar(chat.borrador)}
        ocupado={!!chat.enCurso}
      />
    </section>
  );
}
