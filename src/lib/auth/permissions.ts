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
  | "cierre_clase"
  | "bolsa_pagos"
  | "descuentos"
  | "liquidacion"
  | "reportes_financieros"
  | "reportes_operativos"
  | "agente_ia"
  | "config";

const E: Permission = "edit";
const L: Permission = "read";
const N: Permission = "none";

/**
 * Matriz de permisos del PRD (Apéndice / hoja "Roles y permisos").
 * Filas = módulo · columnas = rol. E=edición, L=lectura, N=sin acceso.
 */
export const PERMISSIONS: Record<ModuleKey, Record<AppRole, Permission>> = {
  dashboard: { superadmin: E, coord_admin: E, coord_deportivo: E, recepcion: L, profesor: L },
  clientes: { superadmin: E, coord_admin: E, coord_deportivo: L, recepcion: E, profesor: N },
  cliente_finanzas: { superadmin: E, coord_admin: E, coord_deportivo: N, recepcion: N, profesor: N },
  empleados: { superadmin: E, coord_admin: L, coord_deportivo: N, recepcion: N, profesor: N },
  academias: { superadmin: E, coord_admin: E, coord_deportivo: E, recepcion: L, profesor: L },
  paquetes: { superadmin: E, coord_admin: E, coord_deportivo: L, recepcion: E, profesor: L },
  eventos: { superadmin: E, coord_admin: E, coord_deportivo: L, recepcion: L, profesor: L },
  clases: { superadmin: E, coord_admin: E, coord_deportivo: E, recepcion: E, profesor: L },
  cierre_clase: { superadmin: E, coord_admin: E, coord_deportivo: E, recepcion: N, profesor: E },
  bolsa_pagos: { superadmin: E, coord_admin: E, coord_deportivo: N, recepcion: N, profesor: N },
  descuentos: { superadmin: E, coord_admin: E, coord_deportivo: N, recepcion: N, profesor: N },
  liquidacion: { superadmin: E, coord_admin: E, coord_deportivo: N, recepcion: N, profesor: N },
  reportes_financieros: { superadmin: E, coord_admin: E, coord_deportivo: N, recepcion: N, profesor: N },
  reportes_operativos: { superadmin: E, coord_admin: E, coord_deportivo: E, recepcion: L, profesor: N },
  agente_ia: { superadmin: E, coord_admin: N, coord_deportivo: N, recepcion: N, profesor: N },
  config: { superadmin: E, coord_admin: N, coord_deportivo: N, recepcion: N, profesor: N },
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
