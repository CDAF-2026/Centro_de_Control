import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { ModulePlaceholder } from "@/components/module-placeholder";

export default async function PaquetesPage() {
  await requireRole(rolesForModule("paquetes"));
  return <ModulePlaceholder title="Paquetes de clases" sprint="Sprint 2" />;
}
