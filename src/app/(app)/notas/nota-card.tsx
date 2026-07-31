"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import {
  Check,
  Link2,
  Pencil,
  Pin,
  RotateCcw,
  Trash2,
  TriangleAlert,
  Users,
} from "lucide-react";
import {
  editarNota,
  eliminarNota,
  reabrirNota,
  resolverNota,
  type NotaState,
} from "./actions";
import { MencionTextarea, partirMenciones } from "./mencion-textarea";
import { NotaComentarios } from "./nota-comentarios";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fechaHoraCorta, tiempoRelativo } from "@/lib/fecha";
import { cn } from "@/lib/utils";
import type { StaffMiembro } from "@/lib/database.types";
import type { NotaVista } from "@/lib/notas";

const inicial: NotaState = {};

/**
 * Inclinación fija por nota (no aleatoria): así una nota conserva su ángulo
 * entre recargas y el tablón no "baila" cada vez que se abre.
 */
const INCLINACIONES = ["-rotate-1", "rotate-1", "-rotate-2", "rotate-2"];

/**
 * Fecha absoluta en el primer render (idéntica en servidor y navegador) y
 * relativa —"hace 25 min"— una vez montado, que depende del reloj del usuario.
 */
function Fecha({ iso }: { iso: string }) {
  const absoluto = fechaHoraCorta(iso);
  const [texto, setTexto] = useState(absoluto);
  useEffect(() => setTexto(tiempoRelativo(iso)), [iso]);
  return (
    <time dateTime={iso} title={absoluto}>
      {texto}
    </time>
  );
}

/** Botón que dispara una server action sencilla sobre la nota. */
function AccionNota({
  accion,
  id,
  children,
  variant = "ghost",
  onOk,
}: {
  accion: (prev: NotaState, fd: FormData) => Promise<NotaState>;
  id: number;
  children: React.ReactNode;
  variant?: "ghost" | "outline" | "destructive";
  onOk?: () => void;
}) {
  const [state, action, pending] = useActionState(accion, inicial);
  useEffect(() => {
    if (state.ok) onOk?.();
  }, [state.ok, onOk]);
  return (
    <form action={action} className="contents">
      <input type="hidden" name="id" value={id} />
      <Button type="submit" size="xs" variant={variant} disabled={pending}>
        {children}
      </Button>
      {state.error && <span className="text-destructive text-xs">{state.error}</span>}
    </form>
  );
}

export function NotaCard({
  nota,
  staff,
  puedeResolver,
  vista = "tablero",
}: {
  nota: NotaVista;
  staff: StaffMiembro[];
  puedeResolver: boolean;
  /** "tablero" = post-it con chinche (en /notas) · "ficha" = plano, dentro de otra tarjeta. */
  vista?: "tablero" | "ficha";
}) {
  const [editando, setEditando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const resuelta = nota.estado === "resuelta";
  const urgente = nota.prioridad === "alta" && !resuelta;
  const esTablero = vista === "tablero";

  const nombres = nota.destinatarios.map((d) => d.nombre ?? "").filter(Boolean);
  const partes = partirMenciones(nota.texto, nombres);

  // El papel: ámbar si urge, apagado si ya se resolvió, papel neutro el resto.
  // La lima queda solo en la chincheta (acento), nunca tiñendo la superficie.
  const papel = urgente
    ? "bg-warning/10 border-warning/25"
    : resuelta
      ? "bg-muted/40 border-border"
      : "bg-muted/45 border-border";
  const chincheta = urgente
    ? "text-warning"
    : resuelta
      ? "text-muted-foreground/50"
      : "text-lime-dim";

  const contenido = (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {urgente && (
          <Badge variant="warning">
            <TriangleAlert /> Urgente
          </Badge>
        )}
        {resuelta && <Badge variant="success">Resuelta</Badge>}
        {nota.paraTodos ? (
          <Badge variant="outline">
            <Users /> Para todo el equipo
          </Badge>
        ) : (
          nota.destinatarios.map((d) => (
            <Badge key={d.id} variant="secondary" title={d.leida ? "Ya la vio" : "Sin abrir"}>
              {d.nombre ?? "Sin nombre"}
              {!d.leida && <span className="bg-primary ml-0.5 size-1.5 rounded-full" />}
            </Badge>
          ))
        )}
        {nota.enlace && (
          <Link href={nota.enlace.href} className="shrink-0">
            <Badge variant="outline" className="hover:bg-card">
              <Link2 /> {nota.enlace.label}
            </Badge>
          </Link>
        )}
      </div>

      {editando ? (
        <FormEditar nota={nota} staff={staff} onListo={() => setEditando(false)} />
      ) : (
        <p className="text-foreground text-sm leading-relaxed whitespace-pre-wrap">
          {partes.map((p, i) =>
            p.mencion ? (
              <span key={i} className="text-charcoal bg-primary/25 rounded px-1 font-semibold">
                {p.texto}
              </span>
            ) : (
              <span key={i}>{p.texto}</span>
            ),
          )}
        </p>
      )}

      <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span>
          {nota.autorNombre} · <Fecha iso={nota.createdAt} />
        </span>
        {nota.editadaEl && <span>· editada</span>}
        {resuelta && nota.resueltaPorNombre && <span>· resuelta por {nota.resueltaPorNombre}</span>}

        {!editando && (
          <div className="ml-auto flex flex-wrap items-center gap-1">
            {!resuelta && puedeResolver && (
              <AccionNota accion={resolverNota} id={nota.id} variant="outline">
                <Check /> Resolver
              </AccionNota>
            )}
            {resuelta && puedeResolver && (
              <AccionNota accion={reabrirNota} id={nota.id}>
                <RotateCcw /> Reabrir
              </AccionNota>
            )}
            {nota.puedeEditar && !resuelta && (
              <Button type="button" size="xs" variant="ghost" onClick={() => setEditando(true)}>
                <Pencil /> Editar
              </Button>
            )}
            {nota.puedeEliminar &&
              (confirmar ? (
                <>
                  <span className="text-foreground">¿Eliminar?</span>
                  <AccionNota accion={eliminarNota} id={nota.id} variant="destructive">
                    Sí, eliminar
                  </AccionNota>
                  <Button type="button" size="xs" variant="ghost" onClick={() => setConfirmar(false)}>
                    No
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => setConfirmar(true)}
                  aria-label="Eliminar nota"
                >
                  <Trash2 />
                </Button>
              ))}
          </div>
        )}
      </div>

      {/* El hilo se oculta mientras se edita la nota, para no encimar dos cajas de texto. */}
      {!editando && (
        <NotaComentarios notaId={nota.id} cuantos={nota.nComentarios} staff={staff} />
      )}
    </>
  );

  // Dentro de la ficha del cliente va plano: sin chinche ni inclinación, que
  // ahí la nota vive dentro de otra tarjeta y el papel sobre papel se ve raro.
  if (!esTablero) {
    return (
      <article
        className={cn(
          "rounded-xl border p-4",
          urgente ? "bg-warning/10 border-warning/25" : "bg-muted/40 border-border",
          resuelta && "opacity-70",
        )}
      >
        {contenido}
      </article>
    );
  }

  return (
    <article
      className={cn(
        "group relative transition-transform duration-300 ease-out",
        // Se endereza al pasar el mouse (y mientras se edita) para poder leerla y escribir cómodo.
        INCLINACIONES[nota.id % INCLINACIONES.length],
        "hover:z-20 hover:rotate-0",
        editando && "z-30 rotate-0",
        resuelta && "opacity-75 hover:opacity-100",
      )}
    >
      {/* Marco exterior: el "papelito" montado sobre el tablón. */}
      <div className="bg-card border-border/70 rounded-2xl border p-2 shadow-md transition-shadow duration-300 group-hover:shadow-xl">
        <Pin className={cn("mx-auto mb-1.5 size-6", chincheta)} aria-hidden />
        <div className={cn("rounded-xl border p-3.5", papel)}>{contenido}</div>
      </div>
    </article>
  );
}

function FormEditar({
  nota,
  staff,
  onListo,
}: {
  nota: NotaVista;
  staff: StaffMiembro[];
  onListo: () => void;
}) {
  const [state, action, pending] = useActionState(editarNota, inicial);
  const [urgente, setUrgente] = useState(nota.prioridad === "alta");

  useEffect(() => {
    if (state.ok) onListo();
  }, [state.ok, onListo]);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={nota.id} />
      <input type="hidden" name="prioridad" value={urgente ? "alta" : "normal"} />
      <MencionTextarea
        staff={staff}
        defaultTexto={nota.texto}
        defaultDestinatarios={nota.paraTodos ? [] : nota.destinatarios.map((d) => d.id)}
        autoFocus
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="xs"
          variant={urgente ? "default" : "outline"}
          onClick={() => setUrgente((u) => !u)}
          aria-pressed={urgente}
        >
          <TriangleAlert /> Urgente
        </Button>
        <Button type="submit" size="xs" disabled={pending} className="ml-auto">
          {pending ? "Guardando…" : "Guardar"}
        </Button>
        <Button type="button" size="xs" variant="ghost" onClick={onListo}>
          Cancelar
        </Button>
      </div>
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
    </form>
  );
}
