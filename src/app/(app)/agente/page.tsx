import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { ModulePlaceholder } from "@/components/module-placeholder";

export default async function AgentePage() {
  await requireRole(rolesForModule("agente_ia"));
  return (
    <ModulePlaceholder
      title="Agente de IA"
      sprint="Sprint 5"
      description="Consultas en lenguaje natural sobre los datos (solo superadministrador), con OpenAI."
    />
  );
}
