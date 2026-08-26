import type { TurnoHoras, TurnoListado } from "@/lib/database.types";

/**
 * Reglas y formatos del módulo de turnos.
 *
 * ⚠️ Los topes de aquí NO son los que calculan las horas — eso lo hace
 * `turnos_horas` en SQL (migración 0081), y es su única fuente. Estas constantes
 * existen para AVISAR (¿se pasó del tope legal de extras?) y para explicar en
 * pantalla. Si algún día cambian, hay que tocar los dos sitios: la migración
 * manda sobre el cálculo, esto solo sobre los avisos.
 */

/** Jornada pactada: 7 h trabajadas al día, más 1 de almuerzo que no cuenta. */
export const JORNADA_DIA_MIN = 7 * 60;
/** Máximo legal semanal desde el 15-jul-2026 (Ley 2101 de 2021). */
export const SEMANA_MIN = 42 * 60;
/** Topes legales de horas extra: 2 al día y 12 a la semana. */
export const EXTRA_DIA_MAX_MIN = 2 * 60;
export const EXTRA_SEMANA_MAX_MIN = 12 * 60;
/**
 * Cuánto se guardan las fotos de las marcaciones (Laura, 26-ago-2026).
 *
 * ⚠️ Esto es SOLO para el texto que ve la gente. Quien de verdad decide es el
 * plazo por defecto de `turno_fotos_vencidas` (migración 0087), al que la tarea
 * llama sin parámetro justamente para que no haya dos números en juego. Si se
 * cambia allá, hay que cambiarlo aquí — y al revés no sirve de nada.
 */
export const FOTOS_DIAS = 45;

/** Desde cuántas horas seguidas se espera que haya un almuerzo marcado. */
export const SIN_ALMUERZO_DESDE_MIN = 6 * 60;

/** Los ocho baldes que devuelve `turnos_horas`, en el orden en que se muestran. */
export const BALDES = [
  { clave: "diurnas", rotulo: "Diurnas", recargo: null },
  { clave: "nocturnas", rotulo: "Nocturnas", recargo: "+35%" },
  { clave: "extra_diurnas", rotulo: "Extra diurnas", recargo: "+25%" },
  { clave: "extra_nocturnas", rotulo: "Extra nocturnas", recargo: "+75%" },
  { clave: "dom_diurnas", rotulo: "Dominicales", recargo: "+90%" },
  { clave: "dom_nocturnas", rotulo: "Dom. nocturnas", recargo: "+90/35%" },
  { clave: "dom_extra_diurnas", rotulo: "Dom. extra", recargo: null },
  { clave: "dom_extra_nocturnas", rotulo: "Dom. extra noct.", recargo: null },
] as const;

export type Balde = (typeof BALDES)[number]["clave"];
export type Totales = Record<Balde, number> & { total: number };

const CERO: Totales = {
  diurnas: 0,
  nocturnas: 0,
  extra_diurnas: 0,
  extra_nocturnas: 0,
  dom_diurnas: 0,
  dom_nocturnas: 0,
  dom_extra_diurnas: 0,
  dom_extra_nocturnas: 0,
  total: 0,
};

/**
 * Suma filas por día en un solo bloque.
 *
 * Sumar en JS aquí NO contradice la regla de agregar en SQL: lo pesado —clasificar
 * minuto a minuto teniendo en cuenta la semana entera— ya lo hizo la base. Esto
 * son cuatro personas por treinta y un días, 124 filas como mucho, muy lejos del
 * corte de 1.000 de PostgREST.
 */
export function sumar(filas: readonly TurnoHoras[]): Totales {
  const acc = { ...CERO };
  for (const f of filas) {
    for (const { clave } of BALDES) acc[clave] += f[clave];
    acc.total += f.total;
  }
  return acc;
}

/** Minutos del bloque que son hora extra, de cualquier franja. */
export function minutosExtra(t: Totales): number {
  return t.extra_diurnas + t.extra_nocturnas + t.dom_extra_diurnas + t.dom_extra_nocturnas;
}

/** Agrupa las filas por semana (el lunes que devuelve el RPC). */
export function porSemana(filas: readonly TurnoHoras[]): { semana: string; totales: Totales }[] {
  const mapa = new Map<string, TurnoHoras[]>();
  for (const f of filas) {
    const lista = mapa.get(f.semana);
    if (lista) lista.push(f);
    else mapa.set(f.semana, [f]);
  }
  return [...mapa.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([semana, fs]) => ({ semana, totales: sumar(fs) }));
}

/** Agrupa por persona. */
export function porPerfil(filas: readonly TurnoHoras[]): Map<string, TurnoHoras[]> {
  const mapa = new Map<string, TurnoHoras[]>();
  for (const f of filas) {
    const lista = mapa.get(f.perfil_id);
    if (lista) lista.push(f);
    else mapa.set(f.perfil_id, [f]);
  }
  return mapa;
}

/** "84:00" — compacto, para tablas densas. */
export function hm(min: number): string {
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
}

/**
 * Lo que pide atención, sacado de los turnos del periodo.
 *
 * Devuelve hechos, no textos: el aviso se redacta en la pantalla, para que
 * cambiar la palabra no obligue a tocar esta lógica.
 */
export type Revisar = {
  /** Nunca se marcó la salida: aporta CERO horas hasta que se corrija. */
  sinCerrar: TurnoListado[];
  /** Turno largo sin almuerzo marcado: se le está pagando la hora de comida. */
  sinAlmuerzo: TurnoListado[];
  /** Falta una de las dos fotos (los creados a mano no cuentan: nunca la tuvieron). */
  sinFoto: TurnoListado[];
};

export function revisar(turnos: readonly TurnoListado[]): Revisar {
  return {
    sinCerrar: turnos.filter((t) => t.fin_el === null),
    sinAlmuerzo: turnos.filter(
      (t) => t.minutos !== null && t.minutos > SIN_ALMUERZO_DESDE_MIN && t.n_pausas === 0,
    ),
    sinFoto: turnos.filter(
      (t) =>
        t.origen !== "ajuste" &&
        (!t.foto_inicio_path || (t.fin_el !== null && !t.foto_fin_path)),
    ),
  };
}

/** Semanas en que la persona pasó el tope legal de horas extra (12 a la semana). */
export function semanasSobreTope(
  filas: readonly TurnoHoras[],
): { perfilId: string; semana: string; extra: number }[] {
  const fuera: { perfilId: string; semana: string; extra: number }[] = [];
  for (const [perfilId, suyas] of porPerfil(filas)) {
    for (const { semana, totales } of porSemana(suyas)) {
      const extra = minutosExtra(totales);
      if (extra > EXTRA_SEMANA_MAX_MIN) fuera.push({ perfilId, semana, extra });
    }
  }
  return fuera;
}

/**
 * "2026-08-25" + "09:02" → instante ISO.
 *
 * ⚠️ El desfase `-05:00` va explícito, igual que en `instanteClase`: sin sufijo,
 * `new Date` interpreta el texto en la zona del SERVIDOR, que en Vercel es UTC —
 * una entrada de las 7 a. m. quedaría guardada como las 2 a. m. Colombia no tiene
 * horario de verano, así que el desfase es constante todo el año.
 */
export function instanteBogota(fecha: string, hhmm: string): string {
  return new Date(`${fecha}T${hhmm}:00-05:00`).toISOString();
}

/**
 * Las columnas del reporte.
 *
 * Son SEIS aunque la base guarde ocho baldes: en pantalla, "Dominicales" junta
 * las diurnas y las nocturnas del domingo, y "Dom. extra" hace lo mismo con las
 * extra. Es lo que pidió Laura, y el desglose fino se conserva en los datos para
 * el día que se valorice en pesos — ahí sí hacen falta separadas, porque el
 * recargo dominical y el nocturno se acumulan.
 */
export const COLUMNAS = [
  { rotulo: "Diurnas", recargo: null, esExtra: false, color: "#d4e157", de: ["diurnas"] },
  { rotulo: "Nocturnas", recargo: "+35%", esExtra: false, color: "#3e6280", de: ["nocturnas"] },
  { rotulo: "Extra diurnas", recargo: "+25%", esExtra: true, color: "#f2b53d", de: ["extra_diurnas"] },
  { rotulo: "Extra nocturnas", recargo: "+75%", esExtra: true, color: "#c98a14", de: ["extra_nocturnas"] },
  { rotulo: "Dominicales", recargo: "+90%", esExtra: false, color: "#8b7cf6", de: ["dom_diurnas", "dom_nocturnas"] },
  { rotulo: "Dom. extra", recargo: null, esExtra: true, color: "#6b57d6", de: ["dom_extra_diurnas", "dom_extra_nocturnas"] },
] as const satisfies readonly {
  rotulo: string; recargo: string | null; esExtra: boolean; color: string; de: readonly Balde[];
}[];

export function valorColumna(t: Totales, col: (typeof COLUMNAS)[number]): number {
  return col.de.reduce((s, k) => s + t[k], 0);
}
