import Link from "next/link";
import { MessageSquare, Plus } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { fechaHoraCorta } from "@/lib/fecha";
import { cn } from "@/lib/utils";
import { leerConversacion, listarConversaciones, type ConversacionVista } from "@/lib/agente/conversaciones";
import { AgenteChat } from "./chat";

/**
 * El Agente IA (Fase 1 · 24-nov-2026): un chat con conversaciones guardadas.
 * Cada superadministrador ve solo las suyas (decisión de Laura). Las preguntas
 * van a la ruta `/agente/chat`, que responde por partes.
 */
export default async function AgentePage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const perfil = await requireRole(rolesForModule("agente_ia")); // solo superadministrador
  const { c } = await searchParams;
  const pedida = Number(c);
  const supabase = await createClient();
  const [conversaciones, actual] = await Promise.all([
    listarConversaciones(supabase, perfil.id),
    Number.isInteger(pedida) && pedida > 0 ? leerConversacion(supabase, perfil.id, pedida) : Promise.resolve(null),
  ]);
  // Una conversación que no existe o no es suya se abre como una nueva, sin avisar
  // que existe (no revela conversaciones ajenas).
  const id = actual ? pedida : null;

  return (
    <div className="space-y-6">
      <div>
        <p className="cdaf-eyebrow text-muted-foreground">Solo superadministrador</p>
        <h1 className="cdaf-headline">Agente de IA</h1>
        <p className="text-muted-foreground mt-1 max-w-3xl text-sm">
          Responde con los datos de la plataforma, Siigo y EasyCancha, y dice de dónde salió cada cifra.
        </p>
      </div>

      {/* minmax(0, …) también en celular: sin él, una tabla ancha de la respuesta
          estira la columna y toda la página se desborda hacia la derecha. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="space-y-3">
          <Link
            href="/agente"
            className="bg-card hover:bg-muted flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium shadow-sm ring-1 ring-foreground/[0.06] transition-colors"
          >
            <Plus className="size-4" />
            Nueva conversación
          </Link>
          <details className="group lg:hidden" open={false}>
            <summary className="text-muted-foreground cursor-pointer text-xs select-none">
              Conversaciones anteriores ({conversaciones.length})
            </summary>
            <div className="mt-2">
              <Lista conversaciones={conversaciones} actual={id} />
            </div>
          </details>
          <div className="hidden lg:block">
            <p className="cdaf-eyebrow text-muted-foreground mb-2">Conversaciones</p>
            <Lista conversaciones={conversaciones} actual={id} />
          </div>
        </aside>

        <AgenteChat key={id ?? "nueva"} conversacionId={id} mensajesIniciales={actual?.mensajes ?? []} />
      </div>
    </div>
  );
}

function Lista({ conversaciones, actual }: { conversaciones: ConversacionVista[]; actual: number | null }) {
  if (!conversaciones.length) {
    return <p className="text-muted-foreground px-1 text-xs">Todavía no hay conversaciones.</p>;
  }
  return (
    <nav className="space-y-1 lg:max-h-[calc(100dvh-20rem)] lg:overflow-y-auto">
      {conversaciones.map((c) => (
        <Link
          key={c.id}
          href={`/agente?c=${c.id}`}
          aria-current={c.id === actual ? "page" : undefined}
          className={cn(
            "flex gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
            c.id === actual ? "bg-card shadow-sm ring-1 ring-foreground/[0.06]" : "hover:bg-card/60",
          )}
        >
          <MessageSquare className="text-muted-foreground mt-0.5 size-4 shrink-0" />
          <span className="min-w-0">
            <span className="line-clamp-2">{c.titulo}</span>
            <span className="text-muted-foreground text-xs tabular-nums">{fechaHoraCorta(c.updated_at)}</span>
          </span>
        </Link>
      ))}
    </nav>
  );
}
