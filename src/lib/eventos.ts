import type { AppRole } from "@/lib/database.types";

/**
 * Ventana de captura de facturas de un evento.
 *
 * Es el ÚNICO sitio donde vive el rango: se le pasa al RPC
 * `evento_facturas_candidatas` y con él se arma la etiqueta que se ve en pantalla
 * ("2 ago → 18 ago"). Con el número escrito en los dos lados, cambiar uno dejaba la
 * etiqueta mintiendo sobre lo que de verdad filtra.
 *
 * Por qué -5/+10 (decisión de Laura, ago-2026, sobre datos medidos):
 *  · Las facturas de torneo llegan en ráfagas cortas (jun 2–8 · jun 26–27 · jul 8–10 ·
 *    jul 17–20). Con ±15 días la ventana de un torneo alcanzaba al torneo ANTERIOR:
 *    al evento del 7-8 de agosto le proponía una factura del 23-jul, que es de la
 *    ráfaga del 20-jul.
 *  · Asimétrico a propósito: la gente se inscribe pegado a la fecha, pero las cuentas
 *    de última hora y los cobros pendientes se facturan días DESPUÉS.
 *  · En modo ampliado bajó el ruido de 200 facturas (tope) a 71.
 *
 * ⚠️ Si algún día entran patrocinios —que se pagan con más antelación— habrá que
 * revisar el lado de "antes". Hoy no hay ninguno: las 42 facturas con línea de torneo
 * de la historia son todas del servicio "Torneo", ni una de "Patrocinio torneo".
 */
export const VENTANA_CANDIDATAS = { antes: 5, despues: 10 } as const;

/** Corre una fecha ISO N días (negativo hacia atrás), sin salirse del día en Bogotá. */
export function correDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Quién puede REABRIR un evento ya cerrado.
 *
 * No es un permiso de módulo: `eventos` en la matriz vale para todo lo demás
 * (crear, inscribir, gastos, profesores, atar facturas y cerrar), y ahí ya entran
 * el coordinador administrativo y Gestión de Eventos. Reabrir es aparte porque es
 * el único que mueve un número YA PUBLICADO: al cerrar se congela el P&G del
 * torneo (`cierre_ingreso/costo/utilidad`) justo para que una factura tardía no
 * cambie un mes que el club ya reportó, y reabrir descongela eso y lo saca del
 * dashboard. Queda en el `audit_log`.
 *
 * Se le suma el coordinador deportivo (24-ago-2026, decisión de Laura: en el
 * módulo de eventos debe poder lo mismo que el superadministrador), porque es
 * quien lleva los torneos y no tiene por qué depender de ella para corregir uno.
 *
 * Es una lista escrita a mano a propósito —como `ADMIN_NOTAS` en notas.ts— por ser
 * una regla de DENTRO del módulo. Si mañana hay que dársela también al
 * coordinador administrativo o a Gestión de Eventos, se agrega aquí y solo aquí.
 */
export const PUEDE_REABRIR_EVENTO: AppRole[] = ["superadmin", "coord_deportivo"];

/** ¿Este rol puede reabrir un evento cerrado? */
export function puedeReabrirEvento(role: AppRole): boolean {
  return PUEDE_REABRIR_EVENTO.includes(role);
}
