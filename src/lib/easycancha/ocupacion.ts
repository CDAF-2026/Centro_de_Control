import "server-only";
import { getBookings, deporteDeSport, CORREO_BLOQUEOS_ACADEMIA, type EcBooking } from "./client";

/**
 * Ocupación de canchas a partir de las reservas de EasyCancha, desglosada
 * CANCHA POR CANCHA (cada cancha física es una fila; las horas del día o los
 * días de la semana son las columnas → mapa de calor).
 *
 * Tres cosas que hay que entender para que las cifras cuadren:
 *
 * 1. EasyCancha NO expone canchas, expone "recursos reservables": la misma cancha
 *    física aparece repetida una vez por cada entrenador y por cada modalidad
 *    ("Cancha 2", "Entrenador Cristian Castro - Cancha 2", "Tenis Arcilla Dobles"…).
 *    En julio/2026 había 36 recursos para 8 canchas reales. Se colapsan por
 *    (deporte + número de cancha), igual que la vista Cancha del calendario.
 *
 * 2. La ocupación se mide en MINUTOS de cancha, no en número de reservas: una
 *    reserva de 4 h no vale lo mismo que una de 1 h.
 *
 * 3. Las reservas internas del club (bloqueos de academia, coordinación) ocupan
 *    cancha de verdad pero no son venta → cuentan como ocupadas y se reportan
 *    aparte para poder distinguirlas.
 *
 * Nota: como todas las ventanas de una vista miden lo mismo (1 h en "hoy", un día
 * operativo en "semana"), el promedio de los % de las celdas equivale a
 * minutos-ocupados / minutos-disponibles → el titular del deporte cuadra con la
 * suma de sus canchas.
 */

/** Horario de operación del club (decisión de negocio, Laura · jul-2026). */
export const APERTURA_H = 7;
export const CIERRE_H = 21;
const MIN_DIA = (CIERRE_H - APERTURA_H) * 60;

/**
 * Correos institucionales con los que el club se auto-reserva canchas
 * (bloqueos de academia, coordinación deportiva, eventos del centro).
 * Es el único criterio confiable: `bookedBy` dice "club" también cuando la
 * recepción reserva a nombre de un cliente (602 de 678 reservas en julio).
 */
const CORREOS_INTERNOS = new Set([
  CORREO_BLOQUEOS_ACADEMIA, // BLOQUEOS ACADEMIAS
  "coordinacioncdaf@gmail.com", // Coordinación Deportiva
  "centrodeportivoaf@gmail.com", // CENTRO DEPORTIVO ALEJANDRO FALLA
]);

/**
 * Canchas físicas por deporte. Es el denominador y también cuántas filas se
 * pintan: si una cancha no tuvo NI una reserva en la semana, igual debe aparecer
 * como fila vacía (esa es justo la señal accionable: "esta cancha está muerta").
 * Se toma el máximo entre esta base y el número de cancha más alto observado.
 */
const CANCHAS_BASE = { tenis: 4, padel: 4 } as const;

export type Deporte = "tenis" | "padel";

/** Ocupación de una cancha en una ventana (una hora o un día). */
export type OcupacionCelda = {
  /** % de la ventana en que la cancha estuvo ocupada (0–100). */
  pct: number;
  /** Parte de `pct` que corresponde a bloqueos internos del club (academia). */
  pctInterno: number;
};

/** Una cancha física y su ocupación a lo largo de las columnas de la vista. */
export type CanchaFila = {
  numero: number;
  label: string; // "Cancha 1"
  celdas: OcupacionCelda[]; // alineadas con `columnas`
  /** Ocupación media de la cancha en todo el periodo (total de la fila). */
  pct: number;
};

export type ColumnaMeta = {
  key: string;
  /** Etiqueta corta del eje ("7a", "12m", "Lun"). */
  label: string;
  /** Texto largo para el tooltip ("07:00–08:00", "lunes 21 de julio"). */
  detalle: string;
  /** Franja en curso / día de hoy: se resalta. */
  destacada: boolean;
  /** Columna aún en el futuro (agendado, no ocupación consumada). */
  futura: boolean;
};

/** Panel de un deporte: sus canchas + los agregados para el titular. */
export type PanelDeporte = {
  deporte: Deporte;
  nCanchas: number;
  canchas: CanchaFila[];
  /** Ocupación media por columna (fila "Todas": recupera la lectura de hora/día pico). */
  totalPorColumna: number[];
  /** Titular del deporte. */
  pct: number;
  pctComercial: number;
  pctInterno: number;
  /** Columna más ocupada del periodo. */
  pico: { label: string; detalle: string; pct: number } | null;
};

export type OcupacionVista = {
  columnas: ColumnaMeta[];
  tenis: PanelDeporte;
  padel: PanelDeporte;
};

export type Ocupacion = {
  hoyIso: string;
  desde: string;
  hasta: string;
  horario: { apertura: number; cierre: number };
  /** Columnas = horas del día de hoy. */
  hoy: OcupacionVista;
  /** Columnas = días de la semana en curso. */
  semana: OcupacionVista;
  error: string | null;
};

const pad = (n: number) => String(n).padStart(2, "0");
const aMin = (hhmm: string | null): number | null => {
  const m = (hhmm ?? "").match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const mean = (xs: number[]): number => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

/**
 * Fecha y hora "de pared" en Bogotá. El resto del proyecto usa la hora local del
 * servidor, que en producción es UTC (+5 h): eso desplazaría la franja "ahora" y
 * el día de hoy a partir de las 7 p.m. Aquí importa al minuto, así que se fija.
 */
function ahoraBogota(): { iso: string; hora: number; minutos: number } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const g = (t: string) => partes.find((p) => p.type === t)?.value ?? "00";
  const hora = Number(g("hour")) % 24;
  return { iso: `${g("year")}-${g("month")}-${g("day")}`, hora, minutos: hora * 60 + Number(g("minute")) };
}

/** Número de cancha física (colapsa los recursos de EasyCancha por número). */
function canchaNumero(courtName: string | null): number | null {
  const m = (courtName ?? "").match(/cancha\s*(\d+)/i);
  return m ? Number(m[1]) : null;
}

function esInterna(b: EcBooking): boolean {
  return CORREOS_INTERNOS.has((b.userEmail ?? "").trim().toLowerCase());
}

/** Reserva ya recortada al horario de operación, lista para agregar. */
type Tramo = { fecha: string; dep: Deporte; cancha: number; ini: number; fin: number; interna: boolean };

function aTramos(bookings: EcBooking[]): Tramo[] {
  const out: Tramo[] = [];
  for (const b of bookings) {
    // Canceladas y permutadas no ocupan cancha; un no-show sí la mantuvo bloqueada.
    if (b.status === "CANCELLED" || b.status === "EXCHANGED") continue;
    const dep = deporteDeSport(b.sportName);
    if (!dep) continue;
    const cancha = canchaNumero(b.courtName);
    if (cancha === null) continue; // recurso sin número de cancha (no ocurre en datos reales)
    const ini = aMin(b.localStartTime);
    const fin = aMin(b.localEndTime);
    if (ini === null || fin === null || fin <= ini) continue;
    const a = Math.max(ini, APERTURA_H * 60);
    const z = Math.min(fin, CIERRE_H * 60);
    if (z <= a) continue; // fuera del horario de operación
    out.push({ fecha: b.localDate, dep, cancha, ini: a, fin: z, interna: esInterna(b) });
  }
  return out;
}

/**
 * Minutos cubiertos por una lista de intervalos, sin doble-contar solapes.
 * En los datos reales no hay solapes dentro de una misma cancha física
 * (EasyCancha bloquea los recursos vinculados), pero la unión lo deja a prueba
 * de que eso cambie.
 */
function minutosUnion(ivs: [number, number][], desde: number, hasta: number): number {
  const rec = ivs
    .map(([a, z]) => [Math.max(a, desde), Math.min(z, hasta)] as [number, number])
    .filter(([a, z]) => z > a)
    .sort((x, y) => x[0] - y[0]);
  let total = 0;
  let curA: number | null = null;
  let curZ = 0;
  for (const [a, z] of rec) {
    if (curA === null) {
      curA = a;
      curZ = z;
    } else if (a <= curZ) {
      curZ = Math.max(curZ, z);
    } else {
      total += curZ - curA;
      curA = a;
      curZ = z;
    }
  }
  return curA === null ? total : total + (curZ - curA);
}

/** Ventana de una columna: qué día y qué minutos abarca. */
type Ventana = { fecha: string; a: number; z: number };

/** Ocupación de una cancha en una ventana (a partir de sus tramos). */
function celda(tramosCancha: Tramo[], v: Ventana): OcupacionCelda {
  const span = v.z - v.a;
  if (span <= 0) return { pct: 0, pctInterno: 0 };
  const delDia = tramosCancha.filter((t) => t.fecha === v.fecha);
  const occ = Math.min(minutosUnion(delDia.map((t) => [t.ini, t.fin]), v.a, v.z), span);
  const intr = Math.min(minutosUnion(delDia.filter((t) => t.interna).map((t) => [t.ini, t.fin]), v.a, v.z), occ);
  return { pct: (occ / span) * 100, pctInterno: (intr / span) * 100 };
}

function panelDeporte(
  tramos: Tramo[],
  dep: Deporte,
  nCanchas: number,
  columnas: ColumnaMeta[],
  ventanas: Ventana[],
): PanelDeporte {
  const delDep = tramos.filter((t) => t.dep === dep);
  const canchas: CanchaFila[] = [];
  for (let n = 1; n <= nCanchas; n++) {
    const tc = delDep.filter((t) => t.cancha === n);
    const celdas = ventanas.map((v) => celda(tc, v));
    canchas.push({ numero: n, label: `Cancha ${n}`, celdas, pct: mean(celdas.map((c) => c.pct)) });
  }

  const totalPorColumna = ventanas.map((_, j) => mean(canchas.map((c) => c.celdas[j].pct)));

  const todas = canchas.flatMap((c) => c.celdas);
  const pct = mean(todas.map((c) => c.pct));
  const pctInterno = mean(todas.map((c) => c.pctInterno));

  let pico: PanelDeporte["pico"] = null;
  totalPorColumna.forEach((p, j) => {
    if (p > 0 && (!pico || p > pico.pct)) pico = { label: columnas[j].label, detalle: columnas[j].detalle, pct: p };
  });

  return { deporte: dep, nCanchas, canchas, totalPorColumna, pct, pctComercial: pct - pctInterno, pctInterno, pico };
}

const fmtDiaCorto = new Intl.DateTimeFormat("es-CO", { weekday: "short", timeZone: "America/Bogota" });
const fmtDiaLargo = new Intl.DateTimeFormat("es-CO", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "America/Bogota",
});

/** Etiqueta de franja corta al estilo del club: "7a", "12m", "3p". */
function etiquetaHora(h: number): string {
  if (h === 12) return "12m";
  const doce = h % 12 === 0 ? 12 : h % 12;
  return `${doce}${h < 12 ? "a" : "p"}`;
}
const capitaliza = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Ocupación de la semana en curso (lunes a domingo) con dos cortes, ambos cancha
 * por cancha: por franja horaria del día de hoy y por día de la semana. Una sola
 * llamada a EasyCancha alimenta las dos vistas; si la API falla devuelve la
 * estructura vacía con `error` para que el dashboard degrade sin romperse.
 */
export async function ocupacionCanchas(): Promise<Ocupacion> {
  const ahora = ahoraBogota();
  const hoyIso = ahora.iso;

  // Semana lunes→domingo que contiene a hoy (misma ventana que el ranking de
  // profesores, para que ambas tarjetas hablen del mismo periodo).
  const [Y, M, D] = hoyIso.split("-").map(Number);
  const base = new Date(Y, M - 1, D);
  const lunes = new Date(Y, M - 1, D - ((base.getDay() + 6) % 7));
  const dias: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + i);
    dias.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  }
  const desde = dias[0];
  const hasta = dias[6];

  const { bookings, error } = await getBookings({ from: desde, to: hasta });
  const tramos = aTramos(bookings);

  // Cuántas canchas pintar por deporte: la base, ampliada si aparece una con número mayor.
  const maxObs = { tenis: 0, padel: 0 };
  for (const t of tramos) maxObs[t.dep] = Math.max(maxObs[t.dep], t.cancha);
  const nCanchas = {
    tenis: Math.max(CANCHAS_BASE.tenis, maxObs.tenis),
    padel: Math.max(CANCHAS_BASE.padel, maxObs.padel),
  };

  // ── Vista HOY: una columna por franja de una hora ──
  const colsHoy: ColumnaMeta[] = [];
  const venHoy: Ventana[] = [];
  for (let h = APERTURA_H; h < CIERRE_H; h++) {
    const a = h * 60;
    colsHoy.push({
      key: `h${h}`,
      label: etiquetaHora(h),
      detalle: `${pad(h)}:00–${pad(h + 1)}:00`,
      destacada: ahora.minutos >= a && ahora.minutos < a + 60,
      futura: ahora.minutos < a,
    });
    venHoy.push({ fecha: hoyIso, a, z: a + 60 });
  }

  // ── Vista SEMANA: una columna por día ──
  const colsSemana: ColumnaMeta[] = dias.map((fecha) => {
    const d = new Date(`${fecha}T12:00:00`);
    return {
      key: fecha,
      label: capitaliza(fmtDiaCorto.format(d).replace(".", "")),
      detalle: fmtDiaLargo.format(d),
      destacada: fecha === hoyIso,
      futura: fecha > hoyIso,
    };
  });
  const venSemana: Ventana[] = dias.map((fecha) => ({ fecha, a: APERTURA_H * 60, z: CIERRE_H * 60 }));

  const armar = (columnas: ColumnaMeta[], ventanas: Ventana[]): OcupacionVista => ({
    columnas,
    tenis: panelDeporte(tramos, "tenis", nCanchas.tenis, columnas, ventanas),
    padel: panelDeporte(tramos, "padel", nCanchas.padel, columnas, ventanas),
  });

  return {
    hoyIso,
    desde,
    hasta,
    horario: { apertura: APERTURA_H, cierre: CIERRE_H },
    hoy: armar(colsHoy, venHoy),
    semana: armar(colsSemana, venSemana),
    error,
  };
}
