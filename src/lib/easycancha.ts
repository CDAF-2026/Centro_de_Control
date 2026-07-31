/** Consultas a EasyCancha para el dashboard (reservas de clases). */
import { createClient } from "@/lib/supabase/server";
import { profesorDeCancha, claveProfesor } from "@/lib/easycancha/client";
import { mapaNombresStaff } from "@/lib/staff";

type RankProfesor = { nombre: string; clases: number };

const pad = (n: number) => String(n).padStart(2, "0");
const isoLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// ⚠️ Este archivo tenía su PROPIA copia de `profesorDeCancha`, parecida pero no
// igual a la de `easycancha/client.ts`: quitaba el prefijo con
// /^(entrenador|profesor)\s+/, que no casa cuando el nombre de la cancha empieza
// por otra cosa. Con los datos reales de jun–jul 2026 eso partía a Willington en
// dos entradas del ranking: "Willinton" (98 reservas) y "/ Profesor Willinton"
// (1). Ahora se usa la función compartida + `claveProfesor()`, que normaliza sin
// tildes ni prefijos, y el nombre que se muestra sale del alias → perfil, así que
// el ranking dice "Willington" y no lo que escribieron en EasyCancha.

/**
 * Clases agendadas por profesor en la semana actual (lunes a domingo), según
 * las reservas de EasyCancha (excluye canceladas). Cachea 10 min para no
 * golpear la API en cada carga del dashboard; si la API falla, lista vacía.
 */
export async function clasesSemanaPorProfesor(): Promise<{ desde: string; hasta: string; ranking: RankProfesor[] }> {
  const base = process.env.EASYCANCHA_API_URL ?? "https://www.easycancha.com/api";
  const token = process.env.EASYCANCHA_TOKEN;
  const club = process.env.EASYCANCHA_CLUB_ID;

  const hoy = new Date();
  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
  const domingo = new Date(lunes);
  domingo.setDate(lunes.getDate() + 6);
  const desde = isoLocal(lunes);
  const hasta = isoLocal(domingo);
  if (!token || !club) return { desde, hasta, ranking: [] };

  try {
    const r = await fetch(
      `${base}/clubs/${club}/bookingsReport?fromIsoDate=${desde}&toIsoDate=${hasta}`,
      { headers: { apikey: token, accept: "application/json" }, next: { revalidate: 600 } },
    );
    const j = await r.json();
    if (!Array.isArray(j?.bookings)) return { desde, hasta, ranking: [] };

    // Se agrupa por la clave normalizada, no por el texto: así "Profesor
    // Willinton", "Entrenador  Willinton" y "/ Profesor Willinton" cuentan como
    // una sola persona. `crudo` es solo el respaldo por si falta el alias.
    const conteo = new Map<string, { crudo: string; clases: number }>();
    for (const b of j.bookings) {
      if (b.status === "CANCELLED") continue;
      const crudo = profesorDeCancha(b.courtName);
      const clave = claveProfesor(crudo);
      if (!clave || !crudo) continue;
      const cur = conteo.get(clave) ?? { crudo, clases: 0 };
      cur.clases++;
      conteo.set(clave, cur);
    }

    // Nombre que se muestra: el del perfil (limpio), vía alias. Si algún día
    // aparece una cancha sin alias, cae al texto de EasyCancha en vez de perderse.
    const supabase = await createClient();
    const { data: alias } = await supabase
      .from("easycancha_profesor_alias")
      .select("clave, profesor_id");
    const nombres = await mapaNombresStaff();
    const canon = new Map(
      (alias ?? []).map((a) => [a.clave, nombres.get(a.profesor_id) ?? null] as const),
    );

    const ranking: RankProfesor[] = [...conteo.entries()]
      .map(([clave, v]) => ({ nombre: canon.get(clave) ?? v.crudo, clases: v.clases }))
      .sort((a, b) => b.clases - a.clases);
    return { desde, hasta, ranking };
  } catch {
    return { desde, hasta, ranking: [] };
  }
}
