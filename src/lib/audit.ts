import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";

export type AuditEntry = {
  /** Acción, ej. "valor_clase.update", "descuento.update", "pago.conciliar". */
  action: string;
  /** Entidad afectada, ej. "profiles", "descuentos". */
  entity: string;
  entityId?: string | null;
  before?: Json;
  after?: Json;
};

/**
 * Registra una acción sensible en la bitácora. Llamar desde Server Actions.
 * El actor se fija al usuario autenticado (la política RLS impide falsearlo).
 *
 * ⚠️ Sin sesión NO escribe nada y sigue de largo. Para el camino público
 * (registro por QR, consentimiento) usar `logAuditSistema`.
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("audit_log").insert({
    actor_id: user.id,
    action: entry.action,
    entity: entry.entity,
    entity_id: entry.entityId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
}

/**
 * Bitácora para lo que hace la PLATAFORMA sin una persona con sesión: la página
 * pública de registro y consentimiento (1-oct-2026). `actor_id = null` es la
 * marca de "lo hizo el sistema", igual que las notas automáticas.
 *
 * Existe porque `logAudit` retorna sin escribir cuando no hay usuario — en el
 * camino público nunca lo hay, así que todo el rastro se habría perdido en
 * silencio. Va con el cliente de servicio (la política de insert exige
 * `actor_id = auth.uid()`, que aquí no aplica). Devuelve el error en vez de
 * lanzarlo: un fallo de auditoría no debe tumbar la firma del papá, pero sí se
 * reporta.
 */
export async function logAuditSistema(entry: AuditEntry): Promise<{ error: string | null }> {
  const admin = createAdminClient();
  const { error } = await admin.from("audit_log").insert({
    actor_id: null,
    action: entry.action,
    entity: entry.entity,
    entity_id: entry.entityId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
  if (error) console.error("[audit sistema]", entry.action, error.message);
  return { error: error?.message ?? null };
}
