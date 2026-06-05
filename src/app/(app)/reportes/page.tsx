import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { ModulePlaceholder } from "@/components/module-placeholder";

export default async function ReportesPage() {
  await requireRole(rolesForModule("reportes_operativos"));
  return <ModulePlaceholder title="Reportes y dashboards" sprint="Sprint 5" />;
}
