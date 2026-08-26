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

/**
 * Instante (ms) en que arranca una clase, a partir de su `fecha` y `hora_inicio`.
 *
 * ⚠️ Existe porque el cálculo escrito a mano estaba MAL en 10 sitios y fallaba en
 * silencio (31-jul-2026). Se hacía así:
 *
 *     new Date(`${fecha}T${hora_inicio ?? "00:00"}:00`)
 *
 * dando por hecho que `hora_inicio` venía como "15:00". Pero PostgREST serializa
 * el tipo `time` de Postgres como **"15:00:00"**, ya con segundos, así que el
 * texto quedaba `"2026-07-31T15:00:00:00"` — cuatro grupos, fecha inválida.
 * `getTime()` devolvía **NaN**, y toda comparación con NaN da `false`. Efecto:
 * `/cierre` salía SIEMPRE vacía, y los dos candados del cierre (no cerrar antes
 * de empezar, y solo superadmin pasadas 24 h) nunca bloqueaban nada.
 *
 * Y el segundo error, más sutil: sin sufijo de zona, `new Date` interpreta el
 * texto en la zona del SERVIDOR. En Vercel eso es UTC, así que una clase de las
 * 15:00 en Cali se habría leído como 15:00 UTC = 10:00 local, y se habría podido
 * cerrar cinco horas antes de empezar. Por eso se fija `-05:00` explícito:
 * Colombia no tiene horario de verano, el desfase es constante todo el año.
 *
 * @param horaPorDefecto qué asumir cuando la clase no tiene hora. "00:00:00"
 *   para el piso (disponible todo el día) y "23:59:00" para el techo de 24 h.
 */
export function instanteClase(
  fecha: string,
  horaInicio: string | null,
  horaPorDefecto: "00:00:00" | "23:59:00" = "00:00:00",
): number {
  const h = horaInicio ?? horaPorDefecto;
  // Tolera "HH:MM" y "HH:MM:SS" — hoy llega lo segundo, pero no volvemos a
  // depender de eso.
  const hms = h.length === 5 ? `${h}:00` : h.slice(0, 8);
  return new Date(`${fecha}T${hms}-05:00`).getTime();
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

// ─────────────────────── Turnos ───────────────────────
// Las tres se arman a mano por lo mismo que `fechaHoraCorta`: se pintan en un
// componente de cliente, así que servidor y navegador tienen que producir
// EXACTAMENTE los mismos caracteres o React descarta la hidratación.

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "7:02 a. m." en hora de Bogotá. */
export function horaCorta(iso: string): string {
  const p = partes(iso);
  const h24 = Number(p.hour);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${p.minute} ${h24 < 12 ? "a. m." : "p. m."}`;
}

/** "martes 26 de agosto" en hora de Bogotá. */
export function fechaLarga(iso: string): string {
  const p = partes(iso);
  const y = Number(p.year);
  const m = Number(p.month);
  const d = Number(p.day);
  // El día de la semana se saca de la fecha YA convertida a Bogotá, con Date.UTC
  // para que el resultado no dependa de la zona horaria del proceso.
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DIAS[dow]} ${d} de ${MESES[m - 1]}`;
}

/** "Buenos días" · "Buenas tardes" · "Buenas noches", según la hora de Bogotá. */
export function saludo(iso: string): string {
  const h = Number(partes(iso).hour);
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}
