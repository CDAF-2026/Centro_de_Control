/** Rango de fechas del periodo observado (dashboard, ingresos). Fuente única. */

const DAY = 86400000;
const RE_ISO = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export type Periodo = "semana" | "mes" | "3m" | "custom";

/** Fecha local en ISO (YYYY-MM-DD) — evita el corrimiento de día de toISOString (UTC). */
export const isoDia = iso;

/** Valida el query param y cae a "mes" si no es un periodo conocido. */
export function parsePeriodo(raw: string | undefined): Periodo {
  return raw === "semana" || raw === "3m" || raw === "custom" ? raw : "mes";
}

export function rangoPeriodo(periodo: Periodo, now: Date, desde?: string, hasta?: string) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayIso = iso(today);
  let curStart: Date;
  let curEnd = today;

  if (periodo === "custom" && desde && hasta && RE_ISO.test(desde) && RE_ISO.test(hasta) && desde <= hasta) {
    curStart = new Date(`${desde}T00:00:00`);
    const h = new Date(`${hasta}T00:00:00`);
    curEnd = iso(h) > todayIso ? today : h;
  } else if (periodo === "semana") {
    curStart = addDays(today, -6);
  } else if (periodo === "3m") {
    curStart = new Date(today.getFullYear(), today.getMonth() - 2, 1);
  } else {
    // "mes": del 1 del mes EN CURSO hasta hoy (mes calendario, no ventana móvil de 30 días).
    curStart = new Date(today.getFullYear(), today.getMonth(), 1);
  }

  const curEndIso = iso(curEnd);

  // Periodo anterior para comparar. En "mes" es el mes calendario previo hasta el
  // mismo día (jul 1–27 vs jun 1–27), para que sea comparable; en el resto, la
  // ventana de igual longitud inmediatamente anterior.
  let prevStart: Date;
  let prevEnd: Date;
  if (periodo === "mes") {
    const y = today.getFullYear();
    const m = today.getMonth();
    prevStart = new Date(y, m - 1, 1);
    const ultimoDiaMesPrev = new Date(y, m, 0).getDate();
    prevEnd = new Date(y, m - 1, Math.min(today.getDate(), ultimoDiaMesPrev));
  } else {
    const spanDays = Math.max(1, Math.round((curEnd.getTime() - curStart.getTime()) / DAY) + 1);
    prevEnd = addDays(curStart, -1);
    prevStart = addDays(prevEnd, -(spanDays - 1));
  }

  return { curStartIso: iso(curStart), curEndIso, todayIso, prevStartIso: iso(prevStart), prevEndIso: iso(prevEnd) };
}
