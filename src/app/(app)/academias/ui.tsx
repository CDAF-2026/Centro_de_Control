import { Badge } from "@/components/ui/badge";

export const DIA_CORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
export const DIA_LARGO = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
/** El club no dicta academia el domingo. Se muestra lunes a sábado. */
export const DIAS_SEMANA = [1, 2, 3, 4, 5, 6];

export const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");

/** "15:00" + 90 → "16:30". Sirve para pintar el rango sin guardarlo dos veces. */
export function horaFin(inicio: string, minutos: number) {
  const [h, m] = hhmm(inicio).split(":").map(Number);
  const t = h * 60 + m + minutos;
  return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export function duracionTexto(min: number) {
  if (min % 60 === 0) return min === 60 ? "1 hora" : `${min / 60} horas`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

/**
 * Recreativa y competencia conviven en la MISMA clase: el planeador del club
 * tiene celdas con niños de las dos (lunes 17:30 de Graciano). Por eso la
 * categoría se pinta por niño y no por clase.
 */
export function ChipCategoria({ categoria }: { categoria: string | null }) {
  if (categoria === "competencia") return <Badge variant="secondary">Competencia</Badge>;
  return <Badge variant="outline">Recreativa</Badge>;
}
