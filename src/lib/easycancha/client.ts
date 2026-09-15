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
  userBirthDate: string | null; // YYYY-MM-DD
  userFoidType: string | null; // "NI" (identificación) | "PP" (pasaporte)
  userFoidCountry: string | null; // ISO-2: "CO", "FR"…
  userFoidNumber: string | null; // número del documento
  status: EcStatus | string;
  amount: number | null;
  totalAmount: number | null;
  totalAmountPaid: number | null;
  customerCodes: string | null;
  /** Nota libre que escribe quien reserva. En los bloqueos de academia el club
   *  apunta ahí el profesor o el grupo ("ACADEMIA CON WILLY"). Ver `esBloqueoAcademia`. */
  comments: string | null;
};

export type EcResult = { bookings: EcBooking[]; error: string | null };

/**
 * Correo con el que el club se auto-reserva las canchas de la academia
 * (usuario "BLOQUEOS ACADEMIAS" de EasyCancha).
 */
export const CORREO_BLOQUEOS_ACADEMIA = "agentecdaf@gmail.com";

/**
 * ¿La reserva es un bloqueo de academia?
 *
 * El correo es el criterio confiable: en jun–jul 2026 las 529 reservas con ese
 * correo son del mismo usuario ("BLOQUEOS ACADEMIAS") y ninguna reserva de
 * bloqueo llegó con otro correo. `bookedBy: "club"` NO sirve: también sale así
 * cuando recepción reserva a nombre de un cliente.
 */
export function esBloqueoAcademia(b: { userEmail?: string | null }): boolean {
  return (b.userEmail ?? "").trim().toLowerCase() === CORREO_BLOQUEOS_ACADEMIA;
}

/** Deriva el deporte interno (tenis/padel) a partir del nombre del deporte de EasyCancha. */
export function deporteDeSport(sportName: string | null): "tenis" | "padel" | null {
  const s = (sportName ?? "").toLowerCase();
  if (s.includes("padel") || s.includes("pádel")) return "padel";
  if (s.includes("tenis") || s.includes("tennis")) return "tenis";
  return null;
}

/**
 * Palabras con las que el club anuncia una clase en la nota de la reserva.
 * Medidas sobre las notas REALES de ago–sep 2026: "Clase con entrenador
 * Sebastián", "clase victor", "Personalizada con Mauro o Salamanca",
 * "CLASE CON VICTOR", "Entrenador Sebastian".
 */
const RE_NOTA_CLASE =
  /\b(clase|clases|entrenador|entrenadora|entrenadores|profesor|profesora|profe|personalizada|personalizado)\b/i;

/**
 * ¿Esta reserva es una CLASE, o un simple alquiler de cancha?
 *
 * Nace del 15-sep-2026: en cafetería pulsaron "Particular" sobre el alquiler de
 * Iván Darío Botero y lo convirtieron en clase. Se revisó la reserva en la API y
 * EasyCancha la manda como alquiler sin ninguna ambigüedad — el error no fue de
 * ellos: fue que la plataforma ofrecía "A un paquete / Particular" sobre
 * CUALQUIER reserva, sin distinguir. Salieron 5 alquileres convertidos en clase.
 *
 * Dos señales, en este orden:
 *  1. La cancha lleva el profesor en el nombre ("Profesor Leo Ruíz Cancha 3").
 *     Es la señal fuerte: 670 de 1.354 reservas de ago–sep.
 *  2. Si la cancha viene pelada ("Cancha 2"), manda la NOTA de la reserva.
 *
 * ⚠️ La cancha pelada NO basta y por eso hace falta la nota: se midió que las
 * clases reales también se reservan en cancha normal —y por el mismo monto de
 * $70.000— así que filtrar solo por el nombre de la cancha habría bloqueado
 * trabajo legítimo del club. Verificado contra los 6 casos que la dueña
 * confirmó a mano: 6 de 6.
 *
 * ⚠️ La nota se USA para decidir pero NUNCA se muestra en una reserva de
 * cliente: ahí el club escribe datos privados ("PAGA LA PRIMERA SEMANA DE
 * MAYO"). Solo se propaga a pantalla en los bloqueos de academia.
 *
 * ⚠️ No es infalible y no debe bloquear: hay clases reales sin nota (la del
 * 23-ago de Esteban venía en blanco). Por eso la pantalla esconde los botones
 * pero deja una salida explícita, en vez de impedirlo.
 */
export function pareceClase(b: Pick<EcBooking, "courtName" | "comments">): boolean {
  if (profesorDeCancha(b.courtName)) return true;
  return RE_NOTA_CLASE.test(b.comments ?? "");
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
 * Normaliza el documento de identidad que viene en una reserva de EasyCancha.
 * Devuelve null cuando el dato es basura: hay gente que escribió su correo en el
 * campo (p. ej. "SIMONAVILAICLOUDCOM"), así que se exige al menos un dígito, y
 * las cédulas (tipo "NI") además deben ser puro número de 5 a 11 dígitos.
 *
 * OJO: el número es la llave contra Siigo (documento = NIT), por eso conviene
 * ser estricto: un documento equivocado le atribuye la plata a quien no es.
 */
export function documentoDeBooking(b: {
  userFoidNumber?: string | null;
  userFoidType?: string | null;
}): { documento: string; tipo: "CC" | "PP" } | null {
  const crudo = (b.userFoidNumber ?? "").trim().replace(/[\s.\-]/g, "").toUpperCase();
  if (!crudo || !/\d/.test(crudo)) return null; // sin dígitos = basura
  const tipo = (b.userFoidType ?? "").toUpperCase() === "PP" ? "PP" : "CC";
  if (tipo === "CC" && !/^\d{5,11}$/.test(crudo)) return null;
  if (tipo === "PP" && !/^[A-Z0-9]{5,20}$/.test(crudo)) return null;
  return { documento: crudo, tipo };
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
