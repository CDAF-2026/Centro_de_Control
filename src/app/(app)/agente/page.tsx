import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { AgenteChat } from "./chat";

export default async function AgentePage() {
  await requireRole(rolesForModule("agente_ia")); // solo superadministrador

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <p className="cdaf-eyebrow text-muted-foreground">Solo superadministrador</p>
        <h1 className="cdaf-headline">Agente de IA</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Pregunta en lenguaje natural sobre los datos del club. El agente responde con base en
          métricas reales (no inventa cifras).
        </p>
      </div>
      <AgenteChat />
    </div>
  );
}
