"use client";

import { useActionState, useRef, useState } from "react";
import Image from "next/image";
import { subirFotoPerfil, quitarFotoPerfil, type PerfilState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { iniciales } from "@/lib/avatar";

export function FotoPerfil({ nombre, url }: { nombre: string; url: string | null }) {
  const [state, action, pending] = useActionState<PerfilState, FormData>(subirFotoPerfil, {});
  // Vista previa local: se ve la foto elegida antes de guardarla.
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const mostrada = preview ?? url;

  return (
    <form action={action} className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <span className="bg-primary text-primary-foreground ring-primary/20 relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full text-xl font-bold ring-2">
        {mostrada ? (
          <Image src={mostrada} alt={nombre} fill sizes="80px" className="object-cover" unoptimized={!!preview} />
        ) : (
          iniciales(nombre)
        )}
      </span>

      <div className="min-w-0 flex-1 space-y-2">
        <Input
          ref={inputRef}
          name="foto"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => {
            const f = e.target.files?.[0];
            setPreview(f ? URL.createObjectURL(f) : null);
          }}
        />
        <p className="text-muted-foreground text-xs">JPG, PNG o WEBP · máximo 2 MB.</p>

        {state.error && <p className="text-destructive text-sm">{state.error}</p>}
        {state.ok && <p className="text-muted-foreground text-sm">{state.ok}</p>}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm" disabled={pending || !preview}>
            {pending ? "Subiendo…" : "Guardar foto"}
          </Button>
          {preview && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setPreview(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
            >
              Cancelar
            </Button>
          )}
          {url && !preview && (
            <Button type="submit" variant="ghost" size="sm" formAction={quitarFotoPerfil}>
              Quitar foto
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
