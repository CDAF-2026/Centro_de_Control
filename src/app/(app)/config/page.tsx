import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { ModulePlaceholder } from "@/components/module-placeholder";

export default async function ConfigPage() {
  await requireRole(rolesForModule("config"));
  return <ModulePlaceholder title="Configuración del sistema" sprint="Sprint 5" />;
}
