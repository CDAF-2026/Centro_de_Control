import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { ModulePlaceholder } from "@/components/module-placeholder";

export default async function ClientesPage() {
  await requireRole(rolesForModule("clientes"));
  return <ModulePlaceholder title="Clientes / Deportistas" sprint="Sprint 1" />;
}
