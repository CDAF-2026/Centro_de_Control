import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AcademiaForm } from "./academia-form";

export default async function NuevaAcademiaPage() {
  await requireRole(["superadmin", "coord_admin", "coord_deportivo"]);

  // Solo los servicios de Siigo que son de academia (categoria_saldo = 'academia').
  const supabase = await createClient();
  const { data: servicios } = await supabase
    .from("servicios")
    .select("id, nombre")
    .eq("categoria_saldo", "academia")
    .order("nombre");

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <Link href="/academias" className="text-muted-foreground text-sm hover:underline">
          ← Academias
        </Link>
        <h1 className="cdaf-headline mt-1">Nueva academia</h1>
      </div>
      <AcademiaForm servicios={servicios ?? []} />
    </div>
  );
}
