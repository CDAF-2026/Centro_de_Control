import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { profesoresActivos } from "@/lib/staff";
import { EventoForm } from "./evento-form";

export default async function NuevoEventoPage() {
  await requireRole(rolesForModule("eventos", "edit"));
  const supabase = await createClient();
  const [serviciosRes, profesores] = await Promise.all([
    supabase.from("servicios").select("id, nombre").eq("activo", true).order("orden"),
    profesoresActivos(),
  ]);

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <Link href="/eventos" className="text-muted-foreground text-sm hover:underline">
          ← Eventos
        </Link>
        <h1 className="cdaf-headline mt-1">Nuevo evento</h1>
      </div>
      <EventoForm servicios={serviciosRes.data ?? []} profesores={profesores} />
    </div>
  );
}
