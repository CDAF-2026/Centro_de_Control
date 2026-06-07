import { createClient } from "@/lib/supabase/server";
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
