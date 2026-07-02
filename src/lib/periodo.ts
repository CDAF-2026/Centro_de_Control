/** Rango de fechas del periodo observado (dashboard, ingresos). Fuente única. */

const DAY = 86400000;
const RE_ISO = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export type Periodo = "semana" | "mes" | "3m" | "custom";

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
    curStart = addDays(today, -29);
  }

  const curEndIso = iso(curEnd);
  const spanDays = Math.max(1, Math.round((curEnd.getTime() - curStart.getTime()) / DAY) + 1);
  const prevEnd = addDays(curStart, -1);
  const prevStart = addDays(prevEnd, -(spanDays - 1));
  return { curStartIso: iso(curStart), curEndIso, todayIso, prevStartIso: iso(prevStart), prevEndIso: iso(prevEnd) };
}
