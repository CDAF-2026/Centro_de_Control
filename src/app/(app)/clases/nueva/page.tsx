import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ClaseForm } from "./clase-form";

export default async function NuevaClasePage() {
  await requireRole(["superadmin", "coord_admin", "coord_deportivo", "recepcion"]);
  const supabase = await createClient();
  const [{ data: clientes }, { data: profesores }] = await Promise.all([
    supabase.from("clientes").select("id, nombres, apellidos").eq("estado", "activo").order("apellidos"),
    supabase.from("profiles").select("id, nombre").eq("role", "profesor").order("nombre"),
  ]);

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <Link href="/clases" className="text-muted-foreground text-sm hover:underline">
          ← Calendario
        </Link>
        <h1 className="cdaf-headline mt-1">Nueva clase individual</h1>
      </div>
      <ClaseForm clientes={clientes ?? []} profesores={profesores ?? []} />
    </div>
  );
}
