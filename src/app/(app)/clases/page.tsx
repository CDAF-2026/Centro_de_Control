import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { ModulePlaceholder } from "@/components/module-placeholder";

export default async function ClasesPage() {
  await requireRole(rolesForModule("clases"));
  return <ModulePlaceholder title="Clases y calendario interno" sprint="Sprint 2" />;
}
