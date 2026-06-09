export type CalEvento = {
  id: string;
  dia: number;
  hora: string; // HH:mm (inicio)
  horaFin: string; // HH:mm (fin; "" si no hay)
  cancha: string | null;
  profesor: string | null;
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

/** Color de fondo del chip según deporte. */
export function eventoBg(ev: { deporte: "tenis" | "padel" | null }) {
  return ev.deporte === "tenis" ? "bg-chart-3/20" : ev.deporte === "padel" ? "bg-lime/30" : "bg-muted";
}

/** Color del punto/indicador según deporte. */
export function eventoDot(ev: { deporte: "tenis" | "padel" | null }) {
  return ev.deporte === "tenis" ? "bg-chart-3" : ev.deporte === "padel" ? "bg-lime" : "bg-muted-foreground";
}
