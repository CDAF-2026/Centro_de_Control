import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { EditarAcademiaForm } from "../editar-academia-form";

export default async function EditarAcademiaPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(rolesForModule("academias", "edit"));
  const { id } = await params;

  const supabase = await createClient();
  const { data: a } = await supabase.from("academias").select("*").eq("id", Number(id)).maybeSingle();
  if (!a) notFound();

  const { data: servicios } = await supabase
    .from("servicios")
    .select("id, nombre")
    .eq("categoria_saldo", "academia")
    .order("nombre");

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <Link href={`/academias/${a.id}`} className="text-muted-foreground text-sm hover:underline">
          ← Volver a la academia
        </Link>
        <h1 className="cdaf-headline mt-1">Editar academia</h1>
      </div>
      <EditarAcademiaForm academia={a} servicios={servicios ?? []} />
    </div>
  );
}
