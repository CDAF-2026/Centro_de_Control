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

export type ClaseCal = {
  id: number;
  dia: number;
  fecha: string;
  hora: string;
  horaFin: string;
  tipo: "academia" | "individual";
  deporte: "tenis" | "padel" | null;
  estado: "programada" | "realizada" | "cancelada" | "no_show";
  cancha: string | null;
  titulo: string;
  profesor: string;
};

const DOW = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const ESTADO_LABEL: Record<string, string> = {
  programada: "Programada",
  realizada: "Realizada",
  cancelada: "Cancelada",
  no_show: "No-show",
};

function estadoVariant(e: string): "secondary" | "outline" | "destructive" {
  if (e === "realizada") return "secondary";
  if (e === "programada") return "outline";
  return "destructive";
}

export function CalendarGrid({
  year,
  month,
  clases,
}: {
  year: number;
  month: number;
  clases: ClaseCal[];
}) {
  const [sel, setSel] = useState<ClaseCal | null>(null);

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const offset = (firstWeekday + 6) % 7;
  const cells: (number | null)[] = [
    ...Array(offset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const byDay = new Map<number, ClaseCal[]>();
  for (const c of clases) {
    if (!byDay.has(c.dia)) byDay.set(c.dia, []);
    byDay.get(c.dia)!.push(c);
  }

  return (
    <>
      <div className="bg-border grid grid-cols-7 gap-px overflow-hidden rounded-lg border">
        {DOW.map((d) => (
          <div key={d} className="bg-muted px-2 py-1 text-center text-xs font-semibold">{d}</div>
        ))}
        {cells.map((day, i) => (
          <div key={i} className="bg-card min-h-24 p-1">
            {day && (
              <>
                <div className="text-muted-foreground text-xs">{day}</div>
                <div className="space-y-0.5">
                  {(byDay.get(day) ?? []).slice(0, 4).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSel(c)}
                      className={`hover:ring-lime block w-full truncate rounded px-1 text-left text-xs hover:ring-2 ${
                        c.deporte === "tenis" ? "bg-chart-3/20" : "bg-lime/30"
                      }`}
                    >
                      {c.hora} {c.tipo === "academia" ? "Acad." : "Ind."}
                    </button>
                  ))}
                  {(byDay.get(day)?.length ?? 0) > 4 && (
                    <div className="text-muted-foreground text-xs">
                      +{byDay.get(day)!.length - 4} más
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <Dialog open={!!sel} onOpenChange={(o) => !o && setSel(null)}>
        <DialogContent>
          {sel && (
            <>
              <DialogHeader>
                <DialogTitle>{sel.titulo}</DialogTitle>
                <DialogDescription>
                  {sel.tipo === "academia" ? "Clase de academia" : "Clase individual"}
                  {sel.deporte ? ` · ${sel.deporte}` : ""}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-1.5 text-sm">
                <p>
                  <span className="text-muted-foreground">Fecha y hora: </span>
                  {sel.fecha} · {sel.hora}
                  {sel.horaFin ? `–${sel.horaFin}` : ""}
                </p>
                <p>
                  <span className="text-muted-foreground">Profesor: </span>
                  {sel.profesor}
                </p>
                <p>
                  <span className="text-muted-foreground">Cancha: </span>
                  {sel.cancha ?? "—"}
                </p>
                <p className="flex items-center gap-2">
                  <span className="text-muted-foreground">Estado:</span>
                  <Badge variant={estadoVariant(sel.estado)}>
                    {ESTADO_LABEL[sel.estado] ?? sel.estado}
                  </Badge>
                </p>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
