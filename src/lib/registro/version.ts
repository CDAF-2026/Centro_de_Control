import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/database.types";

export type VersionConsentimiento = Database["public"]["Tables"]["consentimiento_version"]["Row"];

/**
 * La versión vigente del texto, o null = la página pública muestra "En preparación".
 * Es la puerta del despliegue: el código puede estar en producción sin que nadie
 * firme hasta que se abra la versión (Fase 4). Se lee con el cliente de servicio
 * porque el visitante no tiene sesión.
 */
export async function versionVigente(): Promise<VersionConsentimiento | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("consentimiento_version_vigente");
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
export async function registroAbierto(): Promise<VersionConsentimiento | null> {
  if (process.env.REGISTRO_PUBLICO !== "1") return null;
  return versionVigente();
}

/** Los párrafos del texto, con la EPS puesta donde va el marcador. */
export function parrafosDelTexto(texto: string, eps: string | null): string[] {
  return texto
    .split(/\n\s*\n/)
    .map((p) => p.trim().replace(/\{\{EPS\}\}/g, eps?.trim() || "____________"))
    .filter(Boolean);
}
