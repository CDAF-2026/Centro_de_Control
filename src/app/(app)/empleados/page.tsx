import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { ModulePlaceholder } from "@/components/module-placeholder";

export default async function EmpleadosPage() {
  await requireRole(rolesForModule("empleados"));
  return <ModulePlaceholder title="Empleados" sprint="Sprint 1" />;
}
