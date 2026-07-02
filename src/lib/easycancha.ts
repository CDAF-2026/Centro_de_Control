/** Consultas a EasyCancha para el dashboard (reservas de clases). */

type RankProfesor = { nombre: string; clases: number };

const pad = (n: number) => String(n).padStart(2, "0");
const isoLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Extrae el nombre del profesor del nombre de la cancha de EasyCancha
 *  (p. ej. "Entrenador Willinton - Cancha 3" → "Willinton"). */
function profesorDeCancha(courtName: string | null | undefined): string | null {
  if (!courtName) return null;
  if (!/(profesor|entrenador|profe)/i.test(courtName)) return null;
  const sinCancha = courtName.replace(/[\s\-–—]*cancha\s*\d+.*$/i, "").replace(/[\s\-–—]+$/, "").trim();
  const limpio = sinCancha.replace(/^(entrenador|profesor|profe)\s+/i, "").replace(/\s+/g, " ").trim();
  return limpio || null;
}

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

    const conteo = new Map<string, RankProfesor>();
    for (const b of j.bookings) {
      if (b.status === "CANCELLED") continue;
      const nombre = profesorDeCancha(b.courtName);
      if (!nombre) continue;
      const key = nombre.toLowerCase();
      const cur = conteo.get(key) ?? { nombre, clases: 0 };
      cur.clases++;
      conteo.set(key, cur);
    }
    return { desde, hasta, ranking: [...conteo.values()].sort((a, b) => b.clases - a.clases) };
  } catch {
    return { desde, hasta, ranking: [] };
  }
}
