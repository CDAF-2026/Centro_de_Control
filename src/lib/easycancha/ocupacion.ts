import "server-only";
import { getBookings, deporteDeSport, pareceClase, CORREO_BLOQUEOS_ACADEMIA, type EcBooking } from "./client";

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

/**
 * Mapa de calor de la semana: ocupación media de las canchas de un deporte en cada
 * día y cada hora. Es una tercera lectura de los mismos tramos: `hoy` responde "cómo va
 * el día", `semana` "qué cancha se usa más", y esta "a qué horas se llena el club".
 */
export type OcupacionPorHora = {
  horas: { label: string; detalle: string }[];
  dias: { label: string; detalle: string; hoy: boolean; futuro: boolean }[];
  /** [día][hora] → % medio de las canchas del deporte (0–100). */
  tenis: number[][];
  padel: number[][];
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
  /** Semana completa por día y hora, promediando las canchas de cada deporte. */
  porHora: OcupacionPorHora;
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
function ahoraBogota(ahora: Date): { iso: string; hora: number; minutos: number } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(ahora);
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

/** Reserva ya recortada al horario de operación, lista para agregar.
 *  `clase` = una reserva de cliente que parece clase (`pareceClase`); el resto de
 *  las de cliente son alquiler. Las internas no son ni lo uno ni lo otro. */
type Tramo = { fecha: string; dep: Deporte; cancha: number; ini: number; fin: number; interna: boolean; clase: boolean };

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
    const interna = esInterna(b);
    out.push({ fecha: b.localDate, dep, cancha, ini: a, fin: z, interna, clase: !interna && pareceClase(b) });
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
export async function ocupacionCanchas(now: Date = new Date()): Promise<Ocupacion> {
  const ahora = ahoraBogota(now);
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

  // ── Mapa de calor: día × hora, promediando las canchas del deporte ──
  // Se promedia el % de cada cancha (no se suman minutos) por la misma razón que arriba:
  // todas las ventanas miden una hora, así que el promedio ya es minutos ocupados sobre
  // minutos disponibles, y cuadra con el titular del deporte.
  const matrizPorHora = (dep: Deporte, n: number): number[][] => {
    const delDep = tramos.filter((t) => t.dep === dep);
    const porCancha = Array.from({ length: n }, (_, i) => delDep.filter((t) => t.cancha === i + 1));
    return dias.map((fecha) =>
      colsHoy.map((_, j) => {
        const a = (APERTURA_H + j) * 60;
        return mean(porCancha.map((tc) => celda(tc, { fecha, a, z: a + 60 }).pct));
      }),
    );
  };

  return {
    hoyIso,
    desde,
    hasta,
    horario: { apertura: APERTURA_H, cierre: CIERRE_H },
    hoy: armar(colsHoy, venHoy),
    semana: armar(colsSemana, venSemana),
    porHora: {
      horas: colsHoy.map((c) => ({ label: c.label, detalle: c.detalle })),
      dias: colsSemana.map((c) => ({ label: c.label, detalle: c.detalle, hoy: c.destacada, futuro: c.futura })),
      tenis: matrizPorHora("tenis", nCanchas.tenis),
      padel: matrizPorHora("padel", nCanchas.padel),
    },
    error,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Ocupación por FRANJA (día de la semana × hora) en un rango de fechas.
// La usa el Agente IA (24-nov-2026) para "¿qué horarios convienen para sacar
// promociones?". Mismos criterios que el resto del archivo: minutos de cancha,
// canchas físicas, horario 7 a. m.–9 p. m., internas aparte.
// ───────────────────────────────────────────────────────────────────────────

export const DIAS_SEMANA = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"] as const;

export type FranjasDeporte = {
  deporte: Deporte;
  canchas: number;
  /** Fechas del rango que se midieron. */
  fechas: number;
  /** Ocupación de todo el rango (0–100) y de qué se compone. */
  pct: number;
  pctClases: number;
  pctAlquiler: number;
  pctInterno: number;
  /** "07" … "20": la hora en que EMPIEZA cada columna. */
  horas: string[];
  /** día de la semana → % ocupado en cada hora (entero, 0–100). */
  matriz: Record<(typeof DIAS_SEMANA)[number], number[]>;
  /** Igual, pero solo lo que se vende (sin bloqueos internos del club). */
  matrizVenta: Record<(typeof DIAS_SEMANA)[number], number[]>;
};

/** Lunes = 0 … domingo = 6. */
function diaSemana(fecha: string): number {
  const [y, m, d] = fecha.split("-").map(Number);
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
}

/**
 * Agrega las reservas por día de la semana y hora. Pura (sin red) para poder
 * probarla. Una hora "disponible" es una cancha física durante 60 minutos de una
 * de las fechas: el % de una franja es ocupado ÷ disponible sumando todas las
 * fechas de ese día de la semana.
 */
export function franjasDeReservas(bookings: EcBooking[], fechas: string[]): Record<Deporte, FranjasDeporte> {
  const enRango = new Set(fechas);
  const tramos = aTramos(bookings).filter((t) => enRango.has(t.fecha));
  const horas: number[] = [];
  for (let h = APERTURA_H; h < CIERRE_H; h++) horas.push(h);

  const porClave = new Map<string, Tramo[]>();
  for (const t of tramos) {
    const k = `${t.fecha}|${t.dep}|${t.cancha}`;
    const lista = porClave.get(k);
    if (lista) lista.push(t);
    else porClave.set(k, [t]);
  }

  const deporte = (dep: Deporte): FranjasDeporte => {
    const nCanchas = Math.max(CANCHAS_BASE[dep], ...tramos.filter((t) => t.dep === dep).map((t) => t.cancha));
    const cero = () => DIAS_SEMANA.map(() => horas.map(() => 0));
    const ocupado = cero();
    const interno = cero();
    const clases = cero();
    const disponible = DIAS_SEMANA.map(() => 0); // minutos por hora y día de la semana

    for (const fecha of fechas) {
      const d = diaSemana(fecha);
      disponible[d] += 60 * nCanchas;
      for (let n = 1; n <= nCanchas; n++) {
        const lista = porClave.get(`${fecha}|${dep}|${n}`);
        if (!lista) continue;
        const todos = lista.map((t) => [t.ini, t.fin] as [number, number]);
        const internos = lista.filter((t) => t.interna).map((t) => [t.ini, t.fin] as [number, number]);
        const deClase = lista.filter((t) => t.clase).map((t) => [t.ini, t.fin] as [number, number]);
        horas.forEach((h, j) => {
          const a = h * 60;
          const z = a + 60;
          const occ = minutosUnion(todos, a, z);
          ocupado[d][j] += occ;
          interno[d][j] += Math.min(minutosUnion(internos, a, z), occ);
          clases[d][j] += Math.min(minutosUnion(deClase, a, z), occ);
        });
      }
    }

    const pctDe = (m: number[][]) =>
      Object.fromEntries(
        DIAS_SEMANA.map((nombre, d) => [nombre, m[d].map((min) => (disponible[d] ? Math.round((min / disponible[d]) * 100) : 0))]),
      ) as FranjasDeporte["matriz"];
    const venta = ocupado.map((fila, d) => fila.map((min, j) => Math.max(min - interno[d][j], 0)));
    const suma = (m: number[][]) => m.flat().reduce((s, x) => s + x, 0);
    const totalDisponible = disponible.reduce((s, x) => s + x, 0) * horas.length;
    const pct = (min: number) => (totalDisponible ? Math.round((min / totalDisponible) * 1000) / 10 : 0);
    const occTotal = suma(ocupado);
    const intTotal = suma(interno);
    const claTotal = suma(clases);

    return {
      deporte: dep,
      canchas: nCanchas,
      fechas: fechas.length,
      pct: pct(occTotal),
      pctClases: pct(claTotal),
      pctAlquiler: pct(Math.max(occTotal - intTotal - claTotal, 0)),
      pctInterno: pct(intTotal),
      horas: horas.map((h) => pad(h)),
      matriz: pctDe(ocupado),
      matrizVenta: pctDe(venta),
    };
  };

  return { tenis: deporte("tenis"), padel: deporte("padel") };
}

/** Lo mismo, trayendo las reservas de EasyCancha (máximo 3 meses por consulta). */
export async function ocupacionPorFranja(desde: string, hasta: string) {
  const fechas: string[] = [];
  const [y, m, d] = desde.split("-").map(Number);
  for (let i = 0; ; i++) {
    const f = new Date(y, m - 1, d + i);
    const s = `${f.getFullYear()}-${pad(f.getMonth() + 1)}-${pad(f.getDate())}`;
    if (s > hasta) break;
    fechas.push(s);
  }
  const { bookings, error } = await getBookings({ from: desde, to: hasta });
  return { desde, hasta, ...franjasDeReservas(bookings, fechas), error };
}
