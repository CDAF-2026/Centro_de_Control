import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * La pausa de academias que está corriendo ahora, si la hay (vacaciones).
 * Se lee en Academias y en Cierre: cuando alguien olvida reactivar, nada falla
 * —simplemente dejan de pedirse cierres—, así que el aviso tiene que estar
 * donde se nota que falta algo.
 */
export async function pausaActual(supabase: SupabaseClient<Database>) {
  const { data } = await supabase
    .from("academia_pausa")
    .select("id, desde")
    .is("hasta", null)
    .maybeSingle();
  return data;
}

/** "2026-12-15" → "15 de dic". */
export function fechaCorta(iso: string) {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} de ${["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][m - 1]}`;
}

/**
 * Quién puede pausar y reactivar las academias: SOLO el superadministrador
 * (decisión de Laura, 23-sep-2026). Es regla de DENTRO del módulo, no una fila
 * de la matriz — `academias` en E lo tienen también coordinación. De esta lista
 * beben la acción del servidor y el gateo del botón: una sola lista para las dos
 * capas (mismo patrón que `PUEDE_REABRIR_EVENTO`). La tercera capa es la
 * política `academia_pausa_write`, que dice lo mismo en la base.
 */
export const PUEDE_PAUSAR_ACADEMIAS = ["superadmin"] as const;

export function puedePausarAcademias(role: string) {
  return (PUEDE_PAUSAR_ACADEMIAS as readonly string[]).includes(role);
}
