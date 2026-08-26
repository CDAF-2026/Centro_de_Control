"use client";

import { useState } from "react";
import Image from "next/image";
import { CameraOff, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { corregirTurno, eliminarTurno, agregarTurno, type CorregirState } from "./actions";

const INPUT = "border-input bg-background h-9 w-full rounded-md border px-3 text-sm tabular-nums";

type Foto = { url: string | null; hora: string | null };

/** Miniatura de la foto que se tomó al marcar, o el hueco cuando no la hay. */
function Miniatura({ foto, rotulo }: { foto: Foto; rotulo: string }) {
  return (
    <div className="text-center">
      <div className="bg-muted ring-foreground/[0.08] relative size-16 overflow-hidden rounded-lg ring-1">
        {foto.url ? (
          <Image src={foto.url} alt={rotulo} fill sizes="64px" className="object-cover" unoptimized />
        ) : (
          <span className="text-muted-foreground/60 flex size-full items-center justify-center">
            <CameraOff className="size-5" />
          </span>
        )}
      </div>
      <p className="text-muted-foreground mt-1.5 text-[11.5px] tabular-nums">
        {foto.hora ?? "sin foto"}
      </p>
    </div>
  );
}

/** Los cuatro campos de horario. Los comparten corregir y agregar. */
function CamposHorario({
  entrada,
  salida,
  almDesde,
  almHasta,
  id,
}: {
  entrada: string;
  salida: string;
  almDesde: string;
  almHasta: string;
  id: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-3.5">
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-entrada`}>Entrada</Label>
        <input id={`${id}-entrada`} name="entrada" type="time" defaultValue={entrada} className={INPUT} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-salida`}>Salida</Label>
        <input id={`${id}-salida`} name="salida" type="time" defaultValue={salida} className={INPUT} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-ad`}>
          Salió a almorzar <span className="text-muted-foreground font-normal">(opcional)</span>
        </Label>
        <input id={`${id}-ad`} name="almuerzo_desde" type="time" defaultValue={almDesde} className={INPUT} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-ah`}>
          Regresó <span className="text-muted-foreground font-normal">(opcional)</span>
        </Label>
        <input id={`${id}-ah`} name="almuerzo_hasta" type="time" defaultValue={almHasta} className={INPUT} />
      </div>
    </div>
  );
}

export function CorregirTurno({
  turnoId,
  nombre,
  fecha,
  fechaRotulo,
  entrada,
  salida,
  almDesde,
  almHasta,
  fotoInicio,
  fotoFin,
}: {
  turnoId: number;
  nombre: string;
  fecha: string;
  fechaRotulo: string;
  entrada: string;
  salida: string;
  almDesde: string;
  almHasta: string;
  fotoInicio: Foto;
  fotoFin: Foto;
}) {
  const [estado, setEstado] = useState<CorregirState>({});
  const [pendiente, setPendiente] = useState(false);
  const [abierto, setAbierto] = useState(false);

  async function enviar(datos: FormData, accion: typeof corregirTurno | typeof eliminarTurno) {
    setPendiente(true);
    const r = await accion(datos);
    setPendiente(false);
    setEstado(r);
    if (r.ok) setAbierto(false);
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger className="text-[13px] font-semibold text-[#5b6300] hover:text-[#46530a]">
        Corregir
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Corregir el turno</DialogTitle>
          <DialogDescription>
            {nombre} · {fechaRotulo}
          </DialogDescription>
        </DialogHeader>

        {/* Las fotos van ANTES de los campos: se corrige mirando la prueba de a
            qué hora estuvo, no de memoria. */}
        <div className="bg-muted/50 flex items-center gap-3 rounded-xl p-3.5">
          <Miniatura foto={fotoInicio} rotulo="Foto de entrada" />
          <Miniatura foto={fotoFin} rotulo="Foto de salida" />
          <p className="text-muted-foreground text-[12.5px] leading-relaxed">
            {fotoFin.hora
              ? "Las fotos son la hora real en que marcó."
              : "Marcó entrada y nunca cerró el turno."}
          </p>
        </div>

        <form
          action={(d) => enviar(d, corregirTurno)}
          className="space-y-4"
          id={`corregir-${turnoId}`}
        >
          <input type="hidden" name="turno" value={turnoId} />
          <input type="hidden" name="fecha" value={fecha} />
          <CamposHorario
            id={`c${turnoId}`}
            entrada={entrada}
            salida={salida}
            almDesde={almDesde}
            almHasta={almHasta}
          />

          <div className="space-y-1.5">
            <Label htmlFor={`c${turnoId}-motivo`}>Motivo de la corrección</Label>
            <input
              id={`c${turnoId}-motivo`}
              name="motivo"
              type="text"
              placeholder="Se le olvidó marcar la salida"
              className={cn(INPUT, "tabular-nums-none")}
              required
            />
            <p className="text-muted-foreground text-xs leading-relaxed">
              Es obligatorio. Queda guardado quién corrigió, cuándo, y qué decían las horas
              antes. Si la salida es anterior a la entrada, se toma como del día siguiente.
            </p>
          </div>

          {estado.error && <p className="text-destructive text-sm">{estado.error}</p>}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              formAction={(d) => enviar(d, eliminarTurno)}
              disabled={pendiente}
              className={cn(buttonVariants({ variant: "destructive", size: "sm" }))}
            >
              Borrar el turno
            </button>
            <div className="ml-auto flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAbierto(false)}
                disabled={pendiente}
              >
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={pendiente}>
                {pendiente ? "Guardando…" : "Guardar corrección"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AgregarTurno({
  perfilId,
  nombre,
  fecha,
}: {
  perfilId: string;
  nombre: string;
  /** Día que se propone por defecto: el último del periodo que se está viendo. */
  fecha: string;
}) {
  const [estado, setEstado] = useState<CorregirState>({});
  const [pendiente, setPendiente] = useState(false);
  const [abierto, setAbierto] = useState(false);

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}>
        <Plus className="size-3.5" />
        Agregar un turno que no se marcó
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Agregar un turno</DialogTitle>
          <DialogDescription>{nombre}</DialogDescription>
        </DialogHeader>

        <form
          action={async (d) => {
            setPendiente(true);
            const r = await agregarTurno(d);
            setPendiente(false);
            setEstado(r);
            if (r.ok) setAbierto(false);
          }}
          className="space-y-4"
        >
          <input type="hidden" name="perfil" value={perfilId} />

          <div className="space-y-1.5">
            <Label htmlFor="ag-fecha">Día</Label>
            <input id="ag-fecha" name="fecha" type="date" defaultValue={fecha} className={INPUT} required />
          </div>

          <CamposHorario id="ag" entrada="" salida="" almDesde="" almHasta="" />

          <div className="space-y-1.5">
            <Label htmlFor="ag-motivo">Motivo</Label>
            <input
              id="ag-motivo"
              name="motivo"
              type="text"
              placeholder="No marcó: se fue la luz"
              className={INPUT}
              required
            />
            <p className="text-muted-foreground text-xs leading-relaxed">
              Un turno agregado a mano no tiene foto, y así queda marcado en el listado.
            </p>
          </div>

          {estado.error && <p className="text-destructive text-sm">{estado.error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={pendiente}>
              {pendiente ? "Guardando…" : "Agregar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
