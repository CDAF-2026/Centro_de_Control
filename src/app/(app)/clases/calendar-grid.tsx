"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

export type CalEvento = {
  id: string;
  dia: number;
  hora: string; // HH:mm (chip + orden)
  deporte: "tenis" | "padel" | null;
  fuente: "interna" | "easycancha";
  cancelada: boolean;
  chip: string; // etiqueta corta en la celda
  titulo: string; // título del modal
  subtitulo: string; // subtítulo del modal
  estadoLabel: string;
  estadoTone: "ok" | "warn" | "bad";
  detalles: [string, string][];
};

const DOW = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const TONE: Record<string, "secondary" | "outline" | "destructive"> = {
  ok: "secondary",
  warn: "outline",
  bad: "destructive",
};

function chipClass(ev: CalEvento) {
  const base =
    ev.deporte === "tenis"
      ? "bg-chart-3/20"
      : ev.deporte === "padel"
        ? "bg-lime/30"
        : "bg-muted";
  const cancel = ev.cancelada ? " line-through opacity-50" : "";
  const ec = ev.fuente === "easycancha" ? " border-foreground/30 border-l-2" : "";
  return `${base}${cancel}${ec}`;
}

export function CalendarGrid({
  year,
  month,
  eventos,
}: {
  year: number;
  month: number;
  eventos: CalEvento[];
}) {
  const [selEvento, setSelEvento] = useState<CalEvento | null>(null);
  const [selDia, setSelDia] = useState<number | null>(null);

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const offset = (firstWeekday + 6) % 7;
  const cells: (number | null)[] = [
    ...Array(offset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const byDay = new Map<number, CalEvento[]>();
  for (const e of eventos) {
    if (!byDay.has(e.dia)) byDay.set(e.dia, []);
    byDay.get(e.dia)!.push(e);
  }
  for (const arr of byDay.values()) arr.sort((a, b) => a.hora.localeCompare(b.hora));

  const open = !!selEvento || selDia != null;
  const cerrar = () => {
    setSelEvento(null);
    setSelDia(null);
  };
  const delDia = selDia != null ? byDay.get(selDia) ?? [] : [];

  return (
    <>
      <div className="bg-border grid grid-cols-7 gap-px overflow-hidden rounded-lg border">
        {DOW.map((d) => (
          <div key={d} className="bg-muted px-2 py-1 text-center text-xs font-semibold">{d}</div>
        ))}
        {cells.map((day, i) => {
          const items = day ? byDay.get(day) ?? [] : [];
          return (
            <div key={i} className="bg-card min-h-24 p-1">
              {day && (
                <>
                  {items.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setSelDia(day)}
                      className="text-muted-foreground hover:text-foreground text-xs font-medium"
                    >
                      {day}
                    </button>
                  ) : (
                    <div className="text-muted-foreground text-xs">{day}</div>
                  )}
                  <div className="space-y-0.5">
                    {items.slice(0, 3).map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => setSelEvento(e)}
                        title={`${e.hora} · ${e.titulo}`}
                        className={`hover:ring-lime block w-full truncate rounded px-1 text-left text-xs hover:ring-2 ${chipClass(e)}`}
                      >
                        {e.chip}
                      </button>
                    ))}
                    {items.length > 3 && (
                      <button
                        type="button"
                        onClick={() => setSelDia(day)}
                        className="text-muted-foreground hover:text-foreground w-full text-left text-xs"
                      >
                        +{items.length - 3} más
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={(o) => !o && cerrar()}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          {selEvento ? (
            <>
              <DialogHeader>
                <DialogTitle>{selEvento.titulo}</DialogTitle>
                <DialogDescription>{selEvento.subtitulo}</DialogDescription>
              </DialogHeader>
              <div className="space-y-1.5 text-sm">
                {selEvento.detalles.map(([k, v]) => (
                  <p key={k}>
                    <span className="text-muted-foreground">{k}: </span>
                    {v}
                  </p>
                ))}
                <p className="flex items-center gap-2 pt-1">
                  <span className="text-muted-foreground">Estado:</span>
                  <Badge variant={TONE[selEvento.estadoTone]}>{selEvento.estadoLabel}</Badge>
                </p>
              </div>
              {selDia != null && (
                <button
                  type="button"
                  onClick={() => setSelEvento(null)}
                  className="text-muted-foreground hover:text-foreground mt-2 text-left text-xs"
                >
                  ← Volver al día
                </button>
              )}
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>
                  {selDia} de {MESES[month - 1]} {year}
                </DialogTitle>
                <DialogDescription>
                  {delDia.length} {delDia.length === 1 ? "reserva/clase" : "reservas/clases"}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-1">
                {delDia.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setSelEvento(e)}
                    className="hover:bg-muted flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm"
                  >
                    <span className={`inline-block size-2.5 shrink-0 rounded-full ${e.deporte === "tenis" ? "bg-chart-3" : e.deporte === "padel" ? "bg-lime" : "bg-muted-foreground"}`} />
                    <span className="text-muted-foreground w-12 shrink-0 tabular-nums">{e.hora}</span>
                    <span className={`flex-1 truncate ${e.cancelada ? "line-through opacity-60" : ""}`}>{e.titulo}</span>
                    <span className="text-muted-foreground shrink-0 text-xs">{e.estadoLabel}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
