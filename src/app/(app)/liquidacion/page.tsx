import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { ModulePlaceholder } from "@/components/module-placeholder";

export default async function LiquidacionPage() {
  await requireRole(rolesForModule("liquidacion"));
  return <ModulePlaceholder title="Liquidación de entrenadores" sprint="Sprint 3" />;
}
