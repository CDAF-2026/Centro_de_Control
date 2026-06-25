import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EventoForm } from "./evento-form";

export default async function NuevoEventoPage() {
  await requireRole(["superadmin", "coord_admin"]);
  const supabase = await createClient();
  const [serviciosRes, profesoresRes] = await Promise.all([
    supabase.from("servicios").select("id, nombre").eq("activo", true).order("orden"),
    supabase.from("profiles").select("id, nombre").eq("role", "profesor").order("nombre"),
  ]);

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <Link href="/eventos" className="text-muted-foreground text-sm hover:underline">
          ← Eventos
        </Link>
        <h1 className="cdaf-headline mt-1">Nuevo evento</h1>
      </div>
      <EventoForm servicios={serviciosRes.data ?? []} profesores={profesoresRes.data ?? []} />
    </div>
  );
}
