import "server-only";

/**
 * Cliente de la API de EasyCancha (reservas de canchas).
 * Doc: GET /clubs/{CLUBID}/bookingsReport?fromIsoDate&toIsoDate&sportId
 * Auth: header `apikey: <token>`. Rango máximo del reporte: 3 meses.
 * Solo se usa server-side (el token NUNCA llega al navegador).
 */

export type EcStatus =
  | "BOOKED"
  | "PARTIALLY_PAID"
  | "PAID"
  | "USED"
  | "CANCELLED"
  | "EXCHANGED";

export type EcBooking = {
  id: string;
  courtId: number;
  courtName: string | null;
  sportId: number;
  sportName: string | null;
  localDate: string; // YYYY-MM-DD
  localStartTime: string | null; // HH:mm
  localEndTime: string | null; // HH:mm
  timespan: number | null;
  userId: number | null;
  userFirstName: string | null;
  userLastName: string | null;
  userEmail: string | null;
  userPhone: string | null;
  status: EcStatus | string;
  amount: number | null;
  totalAmount: number | null;
  totalAmountPaid: number | null;
  customerCodes: string | null;
};

export type EcResult = { bookings: EcBooking[]; error: string | null };

/** Deriva el deporte interno (tenis/padel) a partir del nombre del deporte de EasyCancha. */
export function deporteDeSport(sportName: string | null): "tenis" | "padel" | null {
  const s = (sportName ?? "").toLowerCase();
  if (s.includes("padel") || s.includes("pádel")) return "padel";
  if (s.includes("tenis") || s.includes("tennis")) return "tenis";
  return null;
}

/**
 * Extrae el profesor desde el nombre de cancha de EasyCancha.
 * Las clases vienen como "Profesor Leo Ruíz Cancha 3" / "Entrenador Cristian - Cancha 1";
 * los alquileres de cancha abierta ("Cancha 2") devuelven null.
 */
export function profesorDeCancha(courtName: string | null): string | null {
  if (!courtName) return null;
  if (!/(profesor|entrenador|profe)/i.test(courtName)) return null;
  const s = courtName
    .replace(/[\s\-–—]*cancha\s*\d+.*$/i, "")
    .replace(/[\s\-–—]+$/, "")
    .trim();
  return s || courtName.trim();
}

/**
 * Clave normalizada de un nombre de profesor derivado de EasyCancha, para unificar
 * variantes del mismo courtName ("Profesor Willinton", "Entrenador  Willinton",
 * "/ Profesor Willinton" → "willinton"). Se casa contra `easycancha_profesor_alias`.
 */
export function claveProfesor(nombre: string | null): string | null {
  if (!nombre) return null;
  const c = nombre
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(profesor|entrenador|profe)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return c || null;
}

/**
 * Trae las reservas del club para un periodo [from, to] (YYYY-MM-DD, inclusivos).
 * Devuelve `error` (no lanza) para que el calendario degrade con elegancia.
 * Cachea 5 min por URL para no golpear la API en cada navegación de mes.
 */
export async function getBookings(opts: {
  from: string;
  to: string;
  sportId?: number;
}): Promise<EcResult> {
  const base = process.env.EASYCANCHA_API_URL ?? "https://www.easycancha.com/api";
  const token = process.env.EASYCANCHA_TOKEN;
  const club = process.env.EASYCANCHA_CLUB_ID;
  if (!token || !club) {
    return { bookings: [], error: "EasyCancha no está configurado (falta token o club)." };
  }

  const url = new URL(`${base}/clubs/${club}/bookingsReport`);
  url.searchParams.set("fromIsoDate", opts.from);
  url.searchParams.set("toIsoDate", opts.to);
  if (opts.sportId) url.searchParams.set("sportId", String(opts.sportId));

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { apikey: token, accept: "application/json" },
      next: { revalidate: 300 },
    });
  } catch {
    return { bookings: [], error: "No se pudo conectar con EasyCancha." };
  }

  if (!res.ok) {
    return { bookings: [], error: `EasyCancha respondió ${res.status}.` };
  }

  let json: { error?: boolean; code?: number; msg?: string; bookings?: EcBooking[] };
  try {
    json = await res.json();
  } catch {
    return { bookings: [], error: "Respuesta de EasyCancha ilegible." };
  }

  if (json.error || !Array.isArray(json.bookings)) {
    return { bookings: [], error: json.msg || "EasyCancha devolvió un error." };
  }

  return { bookings: json.bookings, error: null };
}
