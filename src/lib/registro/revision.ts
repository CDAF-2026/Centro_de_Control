import type { AppRole } from "@/lib/database.types";

/**
 * Quién revisa la bandeja del registro por QR (cambios de facturación y firmas sin
 * dueño claro). Decisión D8 de Laura (1-oct-2026): superadministrador y coordinador
 * administrativo. Es una regla de DENTRO del módulo de clientes, no una fila de la
 * matriz — mismo patrón que `PUEDE_REABRIR_EVENTO`: de esta lista beben la página,
 * las acciones y el gateo del menú, y las funciones de la base la repiten por dentro.
 */
export const PUEDE_REVISAR_REGISTROS: AppRole[] = ["superadmin", "coord_admin"];
