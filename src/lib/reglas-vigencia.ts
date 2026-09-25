/**
 * Vigencia de las reglas de pago (24-sep-2026).
 *
 * Cada regla paga entre `vigente_desde` y `vigente_hasta` (null = sigue). La liquidación
 * paga cada clase con la regla vigente EL DÍA de la clase, así que cambiar una regla ya no
 * reescribe los meses anteriores. Ver la migración 20260924160000_reglas_vigencia.sql para
 * lo que significa cada combinación de `activo` / `vigente_hasta`.
 *
 * Todo aquí es lógica pura (sin base de datos) para poder probarla sola.
 */

export type Vigencia = { vigente_desde: string; vigente_hasta: string | null };

/** ¿La regla paga el día `fecha` (YYYY-MM-DD)? */
export function vigenteEl(r: Vigencia, fecha: string): boolean {
  return r.vigente_desde <= fecha && (r.vigente_hasta == null || fecha <= r.vigente_hasta);
}

/** ¿La regla paga algún día del periodo [desde, hasta]? */
export function solapa(r: Vigencia, desde: string, hasta: string): boolean {
  return r.vigente_desde <= hasta && (r.vigente_hasta == null || r.vigente_hasta >= desde);
}

/**
 * ¿La fila cuenta para la liquidación en ALGÚN mes? Las del juego actual (`activo`) y las
 * versiones viejas (cerradas con fecha). Las apagadas antes de existir la vigencia
 * (`activo = false` sin `vigente_hasta`) no cuentan en ninguno, igual que antes.
 */
export function cuentaEnLiquidacion(r: Vigencia & { activo: boolean }): boolean {
  return r.activo || r.vigente_hasta != null;
}

/** "2026-10" → "2026-10-01". */
export const primerDia = (ym: string) => `${ym}-01`;

/** Día anterior a una fecha YYYY-MM-DD (sin zonas horarias de por medio). */
export function diaAnterior(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d - 1));
  return t.toISOString().slice(0, 10);
}

/** Campos que definen CÓMO paga una regla. Si alguno cambia, es una regla distinta. */
export type ReglaDatos = {
  nombre: string;
  concepto: string;
  metodo: string;
  pct: number;
  valor: number;
  servicio_id: number | null;
  escalones: { min: number; valor: number }[] | null;
  dias: number[] | null;
  hora_desde: string | null;
  hora_hasta: string | null;
  umbral: number | null;
};

export type ReglaGuardada = ReglaDatos &
  Vigencia & { id: number; orden: number; activo: boolean };

const hhmmss = (t: string | null) => (t ? (t.length === 5 ? `${t}:00` : t.slice(0, 8)) : null);

/**
 * Huella de una regla en su posición. El ORDEN entra en la huella porque decide cuál gana
 * cuando dos casan (el sábado de Graciano: la de salario gana a la de comisión solo por ir
 * primero), así que reordenar también cambia lo que se paga.
 */
function huella(r: ReglaDatos, orden: number): string {
  return JSON.stringify([
    orden,
    r.nombre.trim(),
    r.concepto,
    r.metodo,
    Number(r.pct) || 0,
    Number(r.valor) || 0,
    r.servicio_id ?? null,
    r.escalones?.length ? [...r.escalones].sort((a, b) => a.min - b.min).map((e) => [e.min, e.valor]) : null,
    r.dias?.length ? [...r.dias].sort((a, b) => a - b) : null,
    hhmmss(r.hora_desde),
    hhmmss(r.hora_hasta),
    r.umbral ?? null,
  ]);
}

export type PlanReglas = {
  /** Versiones que pagaron antes de `efectivo`: se cierran el día anterior. */
  cerrar: { id: number; vigente_hasta: string }[];
  /** Filas que nunca llegan a pagar antes de `efectivo`: sobran. */
  borrar: number[];
  /** Reglas nuevas o cambiadas: pagan desde `efectivo`. */
  insertar: (ReglaDatos & { orden: number; vigente_desde: string })[];
  /** Reglas idénticas que siguen como estaban (mismo id, misma vigencia). */
  mantener: number[];
};

/**
 * Qué hacer al guardar el juego de reglas de un profesor con efecto desde `efectivo`
 * (siempre un día 1). Las reglas que no cambian se quedan quietas; lo que cambia se cierra
 * el día anterior y entra de nuevo desde `efectivo`. Así, el mes anterior sigue pagándose
 * con las reglas que tenía.
 *
 * `guardadas` = TODAS las filas del profesor. Solo se tocan las que pagan en `efectivo` o
 * después — incluso versiones viejas: si se elige un mes pasado para corregir un error,
 * lo que ya estaba cerrado dentro de ese rango también hay que recortarlo, o habría dos
 * reglas pagando la misma clase.
 */
export function planGuardarReglas(
  guardadas: ReglaGuardada[],
  nuevas: ReglaDatos[],
  efectivo: string,
): PlanReglas {
  const plan: PlanReglas = { cerrar: [], borrar: [], insertar: [], mantener: [] };

  // Candidatas a quedarse quietas: del juego actual, ya vigentes en `efectivo` y sin cierre.
  const quietas = new Map<string, ReglaGuardada[]>();
  for (const g of guardadas) {
    if (!g.activo || g.vigente_hasta != null || g.vigente_desde > efectivo) continue;
    const k = huella(g, g.orden);
    quietas.set(k, [...(quietas.get(k) ?? []), g]);
  }

  nuevas.forEach((n, orden) => {
    const lista = quietas.get(huella(n, orden));
    const igual = lista?.shift();
    if (igual) plan.mantener.push(igual.id);
    else plan.insertar.push({ ...n, orden, vigente_desde: efectivo });
  });

  const mantenidas = new Set(plan.mantener);
  for (const g of guardadas) {
    if (mantenidas.has(g.id) || !cuentaEnLiquidacion(g)) continue;
    // Ya terminó antes de `efectivo`: es historia que no se toca.
    if (g.vigente_hasta != null && g.vigente_hasta < efectivo) continue;
    if (g.vigente_desde >= efectivo) plan.borrar.push(g.id);
    else plan.cerrar.push({ id: g.id, vigente_hasta: diaAnterior(efectivo) });
  }
  return plan;
}

export const planVacio = (p: PlanReglas) => !p.cerrar.length && !p.borrar.length && !p.insertar.length;
