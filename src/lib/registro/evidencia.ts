import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";

/**
 * Lo que rodea a una firma y la hace defendible: desde dónde y con qué se firmó.
 * La hora NO sale de aquí: la pone Postgres (`now()`) en `consentimiento_firmar`.
 *
 * ⚠️ Nada de esto se imprime en logs con datos personales: solo ids.
 */

/** IP real del visitante. En Vercel viene en `x-forwarded-for` (el primer valor). */
export async function ipDelVisitante(): Promise<string | null> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  const ip = (xff?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim();
  return ip || null;
}

export async function navegadorDelVisitante(): Promise<string | null> {
  const h = await headers();
  return (h.get("user-agent") ?? "").slice(0, 300) || null;
}

/**
 * Hash de la IP para el rate limit y las solicitudes. La IP completa solo se guarda
 * en `consentimiento_firma` (evidencia, acceso restringido); en lo demás basta con
 * poder agrupar sin poder leerla.
 */
export function hashIp(ip: string | null): string {
  return createHash("sha256").update(`cdaf-registro:${ip ?? "sin-ip"}`).digest("hex");
}

export function sha256(buf: Buffer | Uint8Array): string {
  return createHash("sha256").update(buf).digest("hex");
}
