export type CalEvento = {
  id: string;
  dia: number;
  fecha: string; // YYYY-MM-DD
  hora: string; // HH:mm (inicio)
  horaFin: string; // HH:mm (fin; "" si no hay)
  cancha: string | null;
  courtKey: string; // cancha física normalizada por deporte (ej. "padel#3") para la vista por cancha
  courtLabel: string; // etiqueta legible (ej. "Cancha 3")
  profesor: string | null;
  deporte: "tenis" | "padel" | null;
  fuente: "interna" | "easycancha";
  esAcademia: boolean;
  cancelada: boolean;
  chip: string; // etiqueta corta en la celda
  titulo: string; // título del modal
  subtitulo: string; // subtítulo del modal
  estadoLabel: string;
  estadoTone: "ok" | "warn" | "bad";
  detalles: [string, string][];
  /** Datos de la reserva EasyCancha (solo eventos no materializados) para registrarla. */
  ec?: {
    bookingId: string;
    email: string;
    nombres: string;
    apellidos: string;
    telefono: string;
    profesorMatched: string | null;
    /** Reserva del usuario "BLOQUEOS ACADEMIAS" = cancha que el club se auto-reserva. */
    esBloqueo: boolean;
    /** Nota de EasyCancha; solo se propaga en los bloqueos (en las de clientes es privada). */
    comentario: string;
  };
};

/** "15:30" → 930 minutos. Devuelve null si no parsea. */
export function aMinutos(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** 930 → "15:30". */
export function aHora(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Parte un bloqueo de EasyCancha en las franjas que se van a registrar como clases.
 * `duracionMin <= 0` (o mayor que el bloque) = el bloque entero como UNA sola clase.
 * Si al final sobra un pedazo, sale como una franja más corta: así no se pierde
 * tiempo del bloque y la vista previa lo deja ver antes de confirmar.
 */
export function franjasDeBloque(
  horaInicio: string,
  horaFin: string,
  duracionMin: number,
): { inicio: string; fin: string }[] {
  const ini = aMinutos(horaInicio);
  const fin = aMinutos(horaFin);
  if (ini === null || fin === null || fin <= ini) {
    return [{ inicio: horaInicio, fin: horaFin }];
  }
  if (duracionMin <= 0 || duracionMin >= fin - ini) {
    return [{ inicio: aHora(ini), fin: aHora(fin) }];
  }
  const out: { inicio: string; fin: string }[] = [];
  for (let t = ini; t < fin; t += duracionMin) {
    out.push({ inicio: aHora(t), fin: aHora(Math.min(t + duracionMin, fin)) });
  }
  return out;
}

/**
 * Número de cancha, venga como "Cancha 3" (EasyCancha) o como "3" / "2p"
 * (el campo suelto de `academias`). Devuelve null si no hay número.
 */
export function numeroCancha(s: string | null): string | null {
  const t = (s ?? "").trim();
  return /cancha\s*(\d+)/i.exec(t)?.[1] ?? /^(\d+)/.exec(t)?.[1] ?? null;
}

export type AcademiaHorario = {
  id: number;
  nombre: string;
  deporte: string | null;
  dias: number[];
  horaInicio: string | null;
  horaFin: string | null;
  cancha: string | null;
};

export type CandidataAcademia = {
  academia: AcademiaHorario;
  inicio: string;
  fin: string;
  /** La cancha del bloqueo coincide con la configurada en la academia. */
  mismaCancha: boolean;
};

/**
 * Academias que caen dentro de un bloqueo de cancha.
 *
 * Un bloque largo no es "una academia varias veces": son academias DISTINTAS
 * seguidas (martes 15:00–18:00 en Cancha 3 = Bola Roja + Bola Verde + Bola
 * Amarilla). Se cruza día de la semana + solapamiento de horas + deporte.
 *
 * La cancha NO filtra, solo marca: medido contra los bloqueos reales de julio,
 * exigirla dejaba fuera 19 de 22 bloques porque las academias de la mañana
 * están configuradas en Cancha 4 y el club bloquea la Cancha 1. Se devuelve
 * `mismaCancha` para que la UI marque sola las seguras y deje que la persona
 * confirme las demás (así un mismo horario bloqueado en dos canchas no crea
 * la clase dos veces).
 *
 * El horario de cada clase se recorta al bloque, para no inventar tiempo de
 * cancha que el club no reservó.
 */
export function academiasEnBloque(
  academias: AcademiaHorario[],
  ev: { fecha: string; hora: string; horaFin: string; cancha: string | null; deporte: "tenis" | "padel" | null },
): CandidataAcademia[] {
  const bi = aMinutos(ev.hora);
  const bf = aMinutos(ev.horaFin);
  if (bi === null || bf === null || bf <= bi) return [];

  const dow = new Date(`${ev.fecha}T00:00:00`).getDay();
  const canchaEv = numeroCancha(ev.cancha);

  const out: CandidataAcademia[] = [];
  for (const a of academias) {
    if (a.deporte && ev.deporte && a.deporte !== ev.deporte) continue;
    if (!a.dias.includes(dow)) continue;
    const ai = a.horaInicio ? aMinutos(a.horaInicio) : null;
    const af = a.horaFin ? aMinutos(a.horaFin) : null;
    if (ai === null || af === null || af <= ai) continue;
    if (ai >= bf || af <= bi) continue; // no se solapa con el bloque
    const canchaA = numeroCancha(a.cancha);
    out.push({
      academia: a,
      inicio: aHora(Math.max(ai, bi)),
      fin: aHora(Math.min(af, bf)),
      mismaCancha: !!canchaEv && !!canchaA && canchaEv === canchaA,
    });
  }
  return out.sort((x, y) => x.inicio.localeCompare(y.inicio));
}

/** Color de fondo del chip: academia tiene su propio color; el resto, por deporte. */
export function eventoBg(ev: { deporte: "tenis" | "padel" | null; esAcademia?: boolean }) {
  if (ev.esAcademia) return "bg-[#8b7cf6]/20";
  return ev.deporte === "tenis" ? "bg-chart-3/20" : ev.deporte === "padel" ? "bg-lime/30" : "bg-muted";
}

/** Color del punto/indicador: academia tiene su propio color; el resto, por deporte. */
export function eventoDot(ev: { deporte: "tenis" | "padel" | null; esAcademia?: boolean }) {
  if (ev.esAcademia) return "bg-[#8b7cf6]";
  return ev.deporte === "tenis" ? "bg-chart-3" : ev.deporte === "padel" ? "bg-lime" : "bg-muted-foreground";
}

/** Normaliza el nombre de cancha de EasyCancha a la cancha física (Cancha N) por deporte.
 *  Ej: "Profesor Leo Ruíz Cancha 3" (padel) → { key: "padel#3", label: "Cancha 3" }.
 *  Las canchas de tenis y de pádel con el mismo número son distintas → la clave incluye el deporte. */
export function courtInfo(cancha: string | null, deporte: "tenis" | "padel" | null): { key: string; label: string } {
  const m = (cancha ?? "").match(/cancha\s*(\d+)/i);
  if (m) return { key: `${deporte ?? "otra"}#${m[1]}`, label: `Cancha ${m[1]}` };
  const name = (cancha ?? "").trim();
  return name ? { key: `otra#${name.toLowerCase()}`, label: name } : { key: "", label: "Sin cancha" };
}
