"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { MessageSquare, Pencil, Send, Trash2 } from "lucide-react";
import {
  comentariosDeNota,
  comentarNota,
  editarComentario,
  eliminarComentario,
  type ComentarioVista,
  type NotaState,
} from "./actions";
import { MencionTextarea } from "./mencion-textarea";
import { Button } from "@/components/ui/button";
import { fechaHoraCorta } from "@/lib/fecha";
import { cn } from "@/lib/utils";
import type { StaffMiembro } from "@/lib/database.types";

const inicial: NotaState = {};

/**
 * Hilo de respuestas de una nota, plegado dentro del post-it.
 *
 * El contenido se pide al desplegar (no viaja con el listado del tablón): en un
 * relevo de turno la mayoría de notas no tienen ninguna respuesta.
 */
export function NotaComentarios({
  notaId,
  cuantos,
  staff,
}: {
  notaId: number;
  cuantos: number;
  staff: StaffMiembro[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [hilo, setHilo] = useState<ComentarioVista[] | null>(null);
  const [cargando, empezar] = useTransition();

  function recargar() {
    empezar(async () => setHilo(await comentariosDeNota(notaId)));
  }

  function alternar() {
    const nuevo = !abierto;
    setAbierto(nuevo);
    if (nuevo && hilo === null) recargar();
  }

  const total = hilo?.length ?? cuantos;

  return (
    <div className="border-border/70 mt-3 border-t pt-2">
      <button
        type="button"
        onClick={alternar}
        aria-expanded={abierto}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs transition-colors"
      >
        <MessageSquare className="size-3.5" />
        {total === 0
          ? "Comentar"
          : `${total} ${total === 1 ? "comentario" : "comentarios"}`}
      </button>

      {abierto && (
        <div className="mt-2 space-y-2">
          {cargando && hilo === null && (
            <p className="text-muted-foreground text-xs">Cargando…</p>
          )}
          {hilo?.map((c) => (
            <Comentario key={c.id} comentario={c} onCambio={recargar} />
          ))}
          <NuevoComentario notaId={notaId} staff={staff} onEnviado={recargar} />
        </div>
      )}
    </div>
  );
}

function Comentario({
  comentario,
  onCambio,
}: {
  comentario: ComentarioVista;
  onCambio: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [borrarState, borrar, borrando] = useActionState(eliminarComentario, inicial);

  useEffect(() => {
    if (borrarState.ok) onCambio();
  }, [borrarState.ok, onCambio]);

  if (editando) {
    return (
      <EditarComentario
        comentario={comentario}
        onListo={() => {
          setEditando(false);
          onCambio();
        }}
      />
    );
  }

  return (
    <div className="bg-card/70 border-border/60 rounded-lg border px-2.5 py-2">
      <p className="text-foreground text-sm leading-snug whitespace-pre-wrap">{comentario.texto}</p>
      <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 text-[11px]">
        <span>
          {comentario.autorNombre} · {fechaHoraCorta(comentario.createdAt)}
        </span>
        {comentario.editadoEl && <span>· editado</span>}
        <span className="ml-auto flex items-center gap-0.5">
          {comentario.puedeEditar && (
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              onClick={() => setEditando(true)}
              aria-label="Editar comentario"
            >
              <Pencil />
            </Button>
          )}
          {comentario.puedeEliminar &&
            (confirmar ? (
              <form action={borrar} className="flex items-center gap-1">
                <input type="hidden" name="id" value={comentario.id} />
                <Button type="submit" size="xs" variant="destructive" disabled={borrando}>
                  Eliminar
                </Button>
                <Button type="button" size="xs" variant="ghost" onClick={() => setConfirmar(false)}>
                  No
                </Button>
              </form>
            ) : (
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                onClick={() => setConfirmar(true)}
                aria-label="Eliminar comentario"
              >
                <Trash2 />
              </Button>
            ))}
        </span>
      </div>
      {borrarState.error && <p className="text-destructive text-xs">{borrarState.error}</p>}
    </div>
  );
}

function EditarComentario({
  comentario,
  onListo,
}: {
  comentario: ComentarioVista;
  onListo: () => void;
}) {
  const [state, action, pending] = useActionState(editarComentario, inicial);

  useEffect(() => {
    if (state.ok) onListo();
  }, [state.ok, onListo]);

  return (
    <form action={action} className="space-y-1.5">
      <input type="hidden" name="id" value={comentario.id} />
      <textarea
        name="texto"
        defaultValue={comentario.texto}
        rows={2}
        maxLength={1000}
        autoFocus
        className="border-input focus-visible:border-ring focus-visible:ring-ring/50 w-full resize-y rounded-lg border bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:ring-3"
      />
      <div className="flex items-center gap-1.5">
        <Button type="submit" size="xs" disabled={pending}>
          {pending ? "Guardando…" : "Guardar"}
        </Button>
        <Button type="button" size="xs" variant="ghost" onClick={onListo}>
          Cancelar
        </Button>
      </div>
      {state.error && <p className="text-destructive text-xs">{state.error}</p>}
    </form>
  );
}

function NuevoComentario({
  notaId,
  staff,
  onEnviado,
}: {
  notaId: number;
  staff: StaffMiembro[];
  onEnviado: () => void;
}) {
  const [state, action, pending] = useActionState(comentarNota, inicial);
  const [clave, setClave] = useState(0);
  const yaAvisado = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (state.ok && yaAvisado.current !== state.ok) {
      yaAvisado.current = state.ok;
      setClave((k) => k + 1);
      onEnviado();
    }
  }, [state.ok, onEnviado]);

  return (
    <form action={action} className={cn("space-y-1.5", pending && "opacity-70")}>
      <input type="hidden" name="nota_id" value={notaId} />
      <MencionTextarea
        key={clave}
        staff={staff}
        placeholder="Responder… usa @ para sumar a alguien"
        // En un comentario no hay "tablón": si no etiquetas a nadie, simplemente
        // se avisa a los que ya estaban en la nota.
        pistaSinEtiquetar={null}
      />
      <Button type="submit" size="xs" disabled={pending} className="ml-auto flex">
        <Send /> {pending ? "Enviando…" : "Comentar"}
      </Button>
      {state.error && <p className="text-destructive text-xs">{state.error}</p>}
    </form>
  );
}
