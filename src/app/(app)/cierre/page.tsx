import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { ModulePlaceholder } from "@/components/module-placeholder";

export default async function CierrePage() {
  await requireRole(rolesForModule("cierre_clase"));
  return (
    <ModulePlaceholder
      title="Registro y cierre de clases"
      sprint="Sprint 3"
      description="El corazón anti-fuga: cierre móvil de clases, asistencia y alertas de 24h."
    />
  );
}
