import type { AppRole } from "@/lib/database.types";

/** Nivel de acceso por módulo y rol. */
export type Permission = "none" | "read" | "edit";

/** Módulos del sistema (claves estables para guards de UI y rutas). */
export type ModuleKey =
  | "dashboard"
  | "clientes"
  | "cliente_finanzas"
  | "empleados"
  | "academias"
  | "paquetes"
  | "eventos"
  | "clases"
  | "notas"
  | "cierre_clase"
  | "bolsa_pagos"
  | "descuentos"
  | "liquidacion"
  | "reportes_financieros"
  | "agente_ia"
  | "config";

const E: Permission = "edit";
const L: Permission = "read";
const N: Permission = "none";

/**
 * Matriz de permisos. Filas = módulo · columnas = rol.
 * E=edición, L=lectura, N=sin acceso.
 *
 * Revisada con Laura el 31-jul-2026, ya con el equipo real cargado (antes venía
 * del PRD y nadie salvo ella había entrado nunca). Dos cambios de fondo:
 *
 *  1. **El dashboard es solo del superadministrador.** Era la puerta de entrada
 *     de todo el mundo, así que cada rol necesita otra pantalla de inicio: la da
 *     `rutaInicio()`, al final de este mismo archivo. Ojo, de aquí cuelgan `/ingresos` y
 *     `/cartera`, que no están en el menú y solo se alcanzan desde el dashboard.
 *  2. **Cada rol ve solo lo suyo.** El coordinador administrativo perdió
 *     liquidación, reportes e ingresos/cartera; el profesor quedó reducido a lo
 *     que de verdad hace: notas y cerrar sus clases.
 *
 * Las lecturas (L) son deliberadas: recepción consulta torneos y academias pero
 * no los arma, el coordinador deportivo ve clientes y paquetes sin tocarlos
 * (quién vende y quién cobra es del lado administrativo), y el profesor ve el
 * calendario para saber qué le toca, sin poder moverlo.
 */
export const PERMISSIONS: Record<ModuleKey, Record<AppRole, Permission>> = {
  dashboard: { superadmin: E, coord_admin: N, coord_deportivo: N, recepcion: N, profesor: N },
  clientes: { superadmin: E, coord_admin: E, coord_deportivo: L, recepcion: E, profesor: N },
  // La plata del cliente (deuda y facturas de Siigo) dentro de su ficha.
  cliente_finanzas: { superadmin: E, coord_admin: E, coord_deportivo: N, recepcion: N, profesor: N },
  // Ver y editar la compensación; crear cuentas y repartir roles sigue siendo
  // solo del superadministrador (validado aparte en empleados/actions.ts).
  empleados: { superadmin: E, coord_admin: E, coord_deportivo: N, recepcion: N, profesor: N },
  academias: { superadmin: E, coord_admin: E, coord_deportivo: E, recepcion: L, profesor: N },
  paquetes: { superadmin: E, coord_admin: E, coord_deportivo: L, recepcion: E, profesor: N },
  // Los torneos los montan tanto el coordinador administrativo como el deportivo.
  eventos: { superadmin: E, coord_admin: E, coord_deportivo: E, recepcion: L, profesor: N },
  // El profesor VE el calendario pero no lo toca: no crea clases ni las cierra
  // desde ahí. Cerrar las suyas lo hace en su módulo (`cierre_clase`).
  clases: { superadmin: E, coord_admin: E, coord_deportivo: E, recepcion: E, profesor: L },
  // Tablón interno de recados: todo el staff escribe y resuelve (es el relevo de
  // turno) y, desde esta revisión, es también la pantalla de inicio de todos.
  notas: { superadmin: E, coord_admin: E, coord_deportivo: E, recepcion: E, profesor: E },
  cierre_clase: { superadmin: E, coord_admin: N, coord_deportivo: E, recepcion: N, profesor: E },
  bolsa_pagos: { superadmin: E, coord_admin: E, coord_deportivo: N, recepcion: N, profesor: N },
  // ⚠️ `descuentos` no lo consulta ningún archivo: quedó del PRD y hoy es letra
  // muerta. Se deja declarado para no romper el tipo si se retoma la idea.
  descuentos: { superadmin: E, coord_admin: N, coord_deportivo: N, recepcion: N, profesor: N },
  liquidacion: { superadmin: E, coord_admin: N, coord_deportivo: N, recepcion: N, profesor: N },
  reportes_financieros: { superadmin: E, coord_admin: N, coord_deportivo: N, recepcion: N, profesor: N },
  agente_ia: { superadmin: E, coord_admin: N, coord_deportivo: N, recepcion: N, profesor: N },
  // ⚠️ `config` es L, no E, y es a propósito (31-jul-2026): el catálogo de
  // servicios ya NO se edita desde la app. Cada servicio reclama un grupo de
  // producto de Siigo, y a sus ids cuelgan `academias.servicio_id`,
  // `eventos.servicio_id`, `profesor_regla.servicio_id` (comisiones del 25%) y el
  // histórico de `siigo_factura_lineas`. La pantalla quedó como diagnóstico: ver
  // el mapeo y el aviso de grupos huérfanos. Corregir un mapeo va por migración.
  config: { superadmin: L, coord_admin: N, coord_deportivo: N, recepcion: N, profesor: N },
};

/** ¿El rol puede `read` (ver) o `edit` (editar) el módulo? */
export function can(
  role: AppRole,
  module: ModuleKey,
  action: "read" | "edit" = "read",
): boolean {
  const p = PERMISSIONS[module]?.[role] ?? "none";
  return action === "edit" ? p === "edit" : p === "edit" || p === "read";
}

export const ALL_ROLES: AppRole[] = [
  "superadmin",
  "coord_admin",
  "coord_deportivo",
  "recepcion",
  "profesor",
];

/** Roles con al menos `read` (o `edit`) sobre un módulo. Útil para guards de ruta. */
export function rolesForModule(
  module: ModuleKey,
  action: "read" | "edit" = "read",
): AppRole[] {
  return ALL_ROLES.filter((r) => can(r, module, action));
}

/**
 * Pantalla a la que cae cada rol: al iniciar sesión, al abrir `/login` con la
 * sesión ya abierta, y cuando alguien intenta entrar a un módulo que no le toca.
 *
 * Antes estaba escrito `/dashboard` en esos tres sitios, pero desde la revisión
 * del 31-jul-2026 el dashboard es solo del superadministrador: los demás habrían
 * quedado rebotando contra una pantalla que no pueden ver. El resto aterriza en
 * Notas (decisión de Laura) — es el relevo de turno y el único módulo que
 * comparten los cuatro roles, así que lo primero que ven son sus pendientes.
 */
export function rutaInicio(role: AppRole): string {
  return can(role, "dashboard") ? "/dashboard" : "/notas";
}
