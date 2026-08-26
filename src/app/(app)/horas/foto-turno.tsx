"use client";

import { CameraOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FOTOS_DIAS } from "@/lib/turnos";

/**
 * La foto de una marcación: miniatura en la tabla, grande al tocarla.
 *
 * ⚠️ Va con `<img>` y no con `next/image` a propósito. El bucket `turnos` es
 * PRIVADO, así que la foto se sirve con un enlace firmado
 * (`/storage/v1/object/sign/…`), y `next.config.ts` solo declara el dominio de
 * Supabase para las rutas `/public/**`. Con `next/image` la petición se
 * rechazaría.
 */
export function FotoTurno({
  url,
  momento,
  dia,
  hora,
  nombre,
}: {
  url: string | null | undefined;
  momento: "Entrada" | "Salida";
  dia: string;
  hora: string | null;
  nombre: string;
}) {
  if (!url) {
    return (
      <span
        className="bg-muted text-muted-foreground/50 ring-foreground/[0.06] flex size-8 items-center justify-center rounded-md ring-1"
        title={`Sin foto de ${momento.toLowerCase()}`}
      >
        <CameraOff className="size-3.5" />
      </span>
    );
  }

  return (
    <Dialog>
      <DialogTrigger
        aria-label={`Ver la foto de ${momento.toLowerCase()} de ${nombre}, ${dia}`}
        className="ring-foreground/[0.08] focus-visible:ring-ring block size-8 shrink-0 overflow-hidden rounded-md ring-1 transition-all hover:brightness-105 hover:ring-2 focus-visible:ring-2 focus-visible:outline-none"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={momento} className="size-full object-cover" />
      </DialogTrigger>
      {/* ⚠️ Este contenido NO se puede probar con `renderToStaticMarkup`: se
          intentó sacarlo a un componente propio, como se hizo con `VistaCamara`,
          y no funciona — `DialogTitle` y `DialogDescription` exigen el contexto
          del diálogo, y el portal no se pinta en servidor. Por eso queda aquí,
          sin indirección: son cuatro elementos sin lógica, y lo que sí se prueba
          es el botón que lo abre. */}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Foto de {momento.toLowerCase()}</DialogTitle>
          <DialogDescription>
            {nombre} · {dia}
            {hora ? ` · ${hora}` : ""}
          </DialogDescription>
        </DialogHeader>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={`${momento} de ${nombre}, ${dia}`}
          className="bg-muted ring-foreground/[0.06] aspect-square w-full rounded-xl object-cover ring-1"
        />
        <p className="text-muted-foreground text-xs leading-relaxed">
          La hora la puso el servidor al tomarse la foto, no el aparato. Las fotos se borran a
          los {FOTOS_DIAS} días; el registro del turno se conserva siempre.
        </p>
      </DialogContent>
    </Dialog>
  );
}
