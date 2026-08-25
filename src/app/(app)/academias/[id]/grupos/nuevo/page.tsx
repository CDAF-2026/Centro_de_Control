import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { GrupoForm } from "../grupo-form";

export default async function NuevoGrupoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(rolesForModule("academias", "edit"));
  const { id } = await params;
  const academiaId = Number(id);
  const supabase = await createClient();

  const [{ data: a }, { data: grupos }] = await Promise.all([
    supabase.from("academias").select("nombre, categoria").eq("id", academiaId).maybeSingle(),
    supabase.from("academia_grupo").select("nombre").eq("academia_id", academiaId),
  ]);
  if (!a) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/academias/${academiaId}`} className="text-muted-foreground text-sm hover:underline">
          ← {a.nombre}
        </Link>
        <h1 className="cdaf-headline mt-1">Nuevo grupo</h1>
        <p className="text-muted-foreground mt-1.5 text-sm">
          Un grupo reúne a los niños de una misma edad y nivel. Después le pones sus franjas.
        </p>
      </div>
      <GrupoForm
        academiaId={academiaId}
        categoria={a.categoria}
        usados={(grupos ?? []).map((g) => g.nombre)}
      />
    </div>
  );
}
