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

/**
 * Un color por profesor, el MISMO en todas las pantallas del módulo.
 *
 * Se asigna por orden alfabético del nombre y no por cuántas clases tiene: si
 * dependiera de la carga, darle una clase a alguien le cambiaría el color a
 * todos y el club dejaría de reconocer a quién está mirando.
 * La lima NO está en la lista: en CDAF la lima es acción y estado, nunca serie.
 */
export const PALETA = [
  { c: "#2f6db5", s: "#e8f0fa" },
  { c: "#0e8a80", s: "#e2f4f2" },
  { c: "#4d8a2a", s: "#edf5e6" }, // verde: el naranja no le gustó al club (23-sep-2026)
  { c: "#7350c2", s: "#f0ebfa" },
  { c: "#a8487a", s: "#f8e9f1" },
  { c: "#5f7079", s: "#eef1f2" },
] as const;

export function coloresDeProfesores(ids: { id: string; nombre: string }[]) {
  const orden = [...ids].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  return new Map(orden.map((p, i) => [p.id, PALETA[i % PALETA.length]]));
}

/** El deporte que llega por la URL (`?deporte=padel`). Cualquier otra cosa es tenis. */
export type DeportePlaneador = "tenis" | "padel";
export function deporteDe(v: string | null | undefined): DeportePlaneador {
  return v === "padel" ? "padel" : "tenis";
}
export const DEPORTE_NOMBRE: Record<DeportePlaneador, string> = { tenis: "Tenis", padel: "Pádel" };
