import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { AgenteChat } from "./chat";

/**
 * `preguntar` llama a OpenAI y espera la respuesta COMPLETA (no va en streaming),
 * así que toda la llamada tiene que caber dentro del tiempo máximo de la función.
 * El de por defecto en un hosting serverless son ~15 s, y una respuesta con
 * bastante contexto puede rozarlos: la petición moriría a medias sin más aviso.
 *
 * En acciones de servidor `maxDuration` se declara en la PÁGINA y cubre todas las
 * suyas (docs de Next 16, route-segment-config/maxDuration). Es el único punto de
 * la app con una llamada externa lenta; el resto son consultas a Supabase.
 */
export const maxDuration = 60;

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
