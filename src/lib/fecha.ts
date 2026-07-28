const MESES_CORTOS = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

/**
 * Partes de la fecha en horario de Bogotá.
 *
 * Se usa `en-CA` + `hourCycle: h23` y se arma el texto a mano A PROPÓSITO: el
 * formateo en español de `Intl` mete un espacio fino (U+202F) antes de "p. m."
 * en Node pero no siempre en el navegador. El texto se ve idéntico, pero React
 * lo detecta como distinto y descarta la hidratación de todo el árbol
 * (la pantalla deja de pintar). Armándolo nosotros, servidor y navegador
 * producen exactamente los mismos caracteres.
 */
const PARTES_BOGOTA = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Bogota",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function partes(iso: string) {
  const p: Record<string, string> = {};
  for (const parte of PARTES_BOGOTA.formatToParts(new Date(iso))) {
    p[parte.type] = parte.value;
  }
  return p;
}

/** "28 jul, 16:33" — estable entre servidor y navegador. */
export function fechaHoraCorta(iso: string): string {
  const p = partes(iso);
  return `${Number(p.day)} ${MESES_CORTOS[Number(p.month) - 1]}, ${p.hour}:${p.minute}`;
}

/** "hace 25 min", "ayer", … Solo para usar DESPUÉS de montar (depende del reloj). */
export function tiempoRelativo(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return "ayer";
  if (d < 7) return `hace ${d} días`;
  return fechaHoraCorta(iso);
}
