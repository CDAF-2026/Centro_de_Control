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
