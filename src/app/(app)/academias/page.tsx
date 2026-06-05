import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { ModulePlaceholder } from "@/components/module-placeholder";

export default async function AcademiasPage() {
  await requireRole(rolesForModule("academias"));
  return <ModulePlaceholder title="Academias" sprint="Sprint 2" />;
}
