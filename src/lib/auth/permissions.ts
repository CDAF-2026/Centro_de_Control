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
  | "cartera"
  | "agente_ia"
  | "config"
  /** Marcar entrada y salida. Ojo: el rol solo abre la pantalla — QUIÉN debe
   *  marcar lo dice `profiles.marca_turno`, persona por persona. */
  | "turnos"
  /** El reporte de horas clasificadas por la normativa. Solo superadministrador. */
  | "turnos_reporte";

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
  dashboard: { superadmin: E, coord_admin: N, coord_deportivo: N, recepcion: N, profesor: N, gestion_eventos: N, seguridad: N, quiosco: N },
  // `gestion_eventos` entra en E, no en L: al inscribir a un torneo hay que poder
  // crear al que todavía no está en el club. Su plata NO la ve — eso lo tapa
  // `cliente_finanzas`, que sigue en N.
  clientes: { superadmin: E, coord_admin: E, coord_deportivo: L, recepcion: E, profesor: N, gestion_eventos: E, seguridad: N, quiosco: N },
  // La plata del cliente (deuda y facturas de Siigo) dentro de su ficha.
  cliente_finanzas: { superadmin: E, coord_admin: E, coord_deportivo: N, recepcion: N, profesor: N, gestion_eventos: N, seguridad: N, quiosco: N },
  // Ver y editar la compensación; crear cuentas y repartir roles sigue siendo
  // solo del superadministrador (validado aparte en empleados/actions.ts).
  empleados: { superadmin: E, coord_admin: E, coord_deportivo: N, recepcion: N, profesor: N, gestion_eventos: N, seguridad: N, quiosco: N },
  academias: { superadmin: E, coord_admin: E, coord_deportivo: E, recepcion: L, profesor: N, gestion_eventos: N, seguridad: N, quiosco: N },
  paquetes: { superadmin: E, coord_admin: E, coord_deportivo: L, recepcion: E, profesor: N, gestion_eventos: N, seguridad: N, quiosco: N },
  // Los torneos los montan tanto el coordinador administrativo como el deportivo.
  eventos: { superadmin: E, coord_admin: E, coord_deportivo: E, recepcion: L, profesor: N, gestion_eventos: E, seguridad: N, quiosco: N },
  // El profesor VE el calendario pero no lo toca: no crea clases ni las cierra
  // desde ahí. Cerrar las suyas lo hace en su módulo (`cierre_clase`).
  clases: { superadmin: E, coord_admin: E, coord_deportivo: E, recepcion: E, profesor: L, gestion_eventos: N, seguridad: N, quiosco: N },
  // Tablón interno de recados: todo el staff escribe y resuelve (es el relevo de
  // turno) y, desde esta revisión, es también la pantalla de inicio de todos.
  notas: { superadmin: E, coord_admin: E, coord_deportivo: E, recepcion: E, profesor: E, gestion_eventos: E, seguridad: N, quiosco: N },
  cierre_clase: { superadmin: E, coord_admin: N, coord_deportivo: E, recepcion: N, profesor: E, gestion_eventos: N, seguridad: N, quiosco: N },
  bolsa_pagos: { superadmin: E, coord_admin: E, coord_deportivo: N, recepcion: N, profesor: N, gestion_eventos: N, seguridad: N, quiosco: N },
  // ⚠️ `descuentos` no lo consulta ningún archivo: quedó del PRD y hoy es letra
  // muerta. Se deja declarado para no romper el tipo si se retoma la idea.
  descuentos: { superadmin: E, coord_admin: N, coord_deportivo: N, recepcion: N, profesor: N, gestion_eventos: N, seguridad: N, quiosco: N },
  liquidacion: { superadmin: E, coord_admin: N, coord_deportivo: N, recepcion: N, profesor: N, gestion_eventos: N, seguridad: N, quiosco: N },
  reportes_financieros: { superadmin: E, coord_admin: N, coord_deportivo: N, recepcion: N, profesor: N, gestion_eventos: N, seguridad: N, quiosco: N },
  // Cartera por cobrar, SEPARADA de `reportes_financieros` (24-ago-2026). Las dos
  // pantallas vivían bajo el mismo permiso, pero muestran cosas distintas:
  // `/ingresos` dice cuánto entró —la facturación del club— y `/cartera` solo
  // dice quién debe. El coordinador administrativo necesita cobrar sin ver lo
  // primero, y con un permiso compartido era imposible darle una sin la otra.
  // No expone dato nuevo para él: en la Bolsa de pagos ya ve total y saldo
  // factura por factura, que es su trabajo de conciliación.
  cartera: { superadmin: E, coord_admin: L, coord_deportivo: N, recepcion: N, profesor: N, gestion_eventos: N, seguridad: N, quiosco: N },
  agente_ia: { superadmin: E, coord_admin: N, coord_deportivo: N, recepcion: N, profesor: N, gestion_eventos: N, seguridad: N, quiosco: N },
  // ⚠️ `config` es L, no E, y es a propósito (31-jul-2026): el catálogo de
  // servicios ya NO se edita desde la app. Cada servicio reclama un grupo de
  // producto de Siigo, y a sus ids cuelgan `academias.servicio_id`,
  // `eventos.servicio_id`, `profesor_regla.servicio_id` (comisiones del 25%) y el
  // histórico de `siigo_factura_lineas`. La pantalla quedó como diagnóstico: ver
  // el mapeo y el aviso de grupos huérfanos. Corregir un mapeo va por migración.
  config: { superadmin: L, coord_admin: N, coord_deportivo: N, recepcion: N, profesor: N, gestion_eventos: N, seguridad: N, quiosco: N },
  // ⚠️ Que el rol tenga `turnos` NO significa que la persona marque: eso lo dice
  // `profiles.marca_turno`, uno por uno. El rol solo decide si la pantalla existe
  // para él. Está abierto a casi todos porque los cuatro que marcan hoy son de
  // roles distintos (recepción, coord. administrativo y seguridad) y mañana puede
  // entrar cualquier otro. `quiosco` no marca lo suyo: marca por cuenta de otros,
  // y para eso tiene su propia pantalla.
  turnos: { superadmin: E, coord_admin: E, coord_deportivo: E, recepcion: E, profesor: E, gestion_eventos: E, seguridad: E, quiosco: N },
  // El reporte de horas: solo el superadministrador (decisión de Laura, 25-ago-2026).
  // Ni siquiera el coordinador administrativo, que además es uno de los que marca.
  turnos_reporte: { superadmin: E, coord_admin: N, coord_deportivo: N, recepcion: N, profesor: N, gestion_eventos: N, seguridad: N, quiosco: N },
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

// ⚠️ Un rol que falte aquí queda MUDO aunque la matriz le dé permisos: `rolesForModule`
// solo recorre esta lista, y de ella salen casi todos los `requireRole` de páginas y
// acciones. Al agregar un rol hay que tocar los dos sitios.
export const ALL_ROLES: AppRole[] = [
  "superadmin",
  "coord_admin",
  "coord_deportivo",
  "recepcion",
  "profesor",
  "gestion_eventos",
  "seguridad",
  "quiosco",
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
  if (can(role, "dashboard")) return "/dashboard";
  // ⚠️ El PC de recepción y el vigilante NO tienen notas. Si cayeran ahí como el
  // resto, `requireRole` los devolvería a su pantalla de inicio —que sería
  // Notas otra vez— y quedarían rebotando sin poder entrar a ninguna parte. Son
  // los primeros roles sin ningún módulo, así que hay que decirles a dónde van.
  if (role === "quiosco") return "/quiosco";
  if (!can(role, "notas")) return "/turnos";
  return "/notas";
}
