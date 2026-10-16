import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/database.types";

export type VersionConsentimiento = Database["public"]["Tables"]["consentimiento_version"]["Row"];
/**
 * Dos textos distintos (7-oct-2026): el acudiente firma por el menor; el adulto firma en nombre propio.
 * Más los dos reglamentos que se aceptan con la firma: el General y el de Academias (16-oct-2026).
 */
export type PublicoConsentimiento = "menores" | "adultos" | "reglamento" | "academias";

/**
 * Revisión LOCAL de textos que todavía no se abren (16-oct-2026). Con `REGISTRO_VERSIONES_PREVIA=1` en el
 * `.env` y fuera de producción, cada público muestra su versión EN PREPARACIÓN (`vigente_desde` null) si
 * la hay. La firma guarda el id de la versión que se mostró (el RPC lo acepta si está vigente o en
 * preparación), así que lo firmado es exactamente lo leído. En Vercel nunca aplica.
 */
function previaActiva(): boolean {
  return process.env.REGISTRO_VERSIONES_PREVIA === "1" && process.env.NODE_ENV !== "production";
}

async function versionEnPreparacion(publico: PublicoConsentimiento): Promise<VersionConsentimiento | null> {
  const { data, error } = await createAdminClient()
    .from("consentimiento_version")
    .select("*")
    .eq("publico", publico)
    .is("vigente_desde", null)
    .is("vigente_hasta", null)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) console.error("[registro] versión en preparación:", error.message);
  return data ?? null;
}

/**
 * La versión vigente del texto para un público, o null = la página pública muestra
 * "En preparación". Es la puerta del despliegue: el código puede estar en producción
 * sin que nadie firme hasta que se abra la versión (Fase 4). Se lee con el cliente de
 * servicio porque el visitante no tiene sesión.
 */
export async function versionVigente(publico: PublicoConsentimiento = "menores"): Promise<VersionConsentimiento | null> {
  if (previaActiva()) {
    const previa = await versionEnPreparacion(publico);
    if (previa) return previa;
  }
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("consentimiento_version_vigente", { p_publico: publico });
  if (error) {
    console.error("[registro] versión vigente:", error.message);
    return null;
  }
  // El RPC devuelve la fila compuesta; sin vigente, todos sus campos vienen null.
  return data && data.id != null ? data : null;
}

/**
 * ¿Está abierta la página pública? Dos llaves, las dos necesarias:
 *  1. Una versión vigente del texto (la base; es lo que el RPC de firmar exige).
 *  2. `REGISTRO_PUBLICO=1` en el entorno. En el `.env` local está desde el
 *     principio, para revisar y probar; en Vercel se pone en la Fase 4, el día
 *     que el club imprime el QR. Así el código puede estar desplegado y la
 *     versión abierta sin que nadie de afuera llegue al formulario.
 */
export async function registroAbierto(publico: PublicoConsentimiento = "menores"): Promise<VersionConsentimiento | null> {
  if (process.env.REGISTRO_PUBLICO !== "1") return null;
  return versionVigente(publico);
}

/**
 * Los dos textos para la pantalla de firma: la edad que escriba la persona decide cuál
 * se muestra. Sin texto de adultos, el adulto firma con el de menores (como en D11).
 */
export async function textosAbiertos(): Promise<{ menores: VersionConsentimiento; adultos: VersionConsentimiento } | null> {
  const menores = await registroAbierto("menores");
  if (!menores) return null;
  const adultos = (await registroAbierto("adultos")) ?? menores;
  return { menores, adultos };
}


/**
 * El Reglamento General vigente (opción A, 8-oct-2026). No depende de `REGISTRO_PUBLICO`: es
 * información pública del club y la página /registro/reglamento se puede compartir sola.
 */
export async function reglamentoVigente(): Promise<VersionConsentimiento | null> {
  return versionVigente("reglamento");
}

/** El Reglamento de Academias vigente (16-oct-2026): lo acepta quien firma por un menor. Público, como el General. */
export async function reglamentoAcademiasVigente(): Promise<VersionConsentimiento | null> {
  return versionVigente("academias");
}
