import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { GrupoForm } from "../../grupo-form";

export default async function EditarGrupoPage({
  params,
}: {
  params: Promise<{ id: string; grupoId: string }>;
}) {
  await requireRole(rolesForModule("academias", "edit"));
  const { id, grupoId } = await params;
  const academiaId = Number(id);
  const gid = Number(grupoId);
  const supabase = await createClient();

  const [{ data: g }, { data: a }, { data: grupos }] = await Promise.all([
    supabase.from("academia_grupo").select("id, academia_id, nombre, nivel, edad_min, edad_max").eq("id", gid).maybeSingle(),
    supabase.from("academias").select("nombre, categoria").eq("id", academiaId).maybeSingle(),
    supabase.from("academia_grupo").select("nombre").eq("academia_id", academiaId),
  ]);
  if (!g || !a || g.academia_id !== academiaId) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/academias/${academiaId}/grupos/${gid}`} className="text-muted-foreground text-sm hover:underline">
          ← {g.nombre}
        </Link>
        <h1 className="cdaf-headline mt-1">Editar grupo</h1>
      </div>
      <GrupoForm
        academiaId={academiaId}
        categoria={a.categoria}
        inicial={{ id: g.id, nombre: g.nombre, nivel: g.nivel, edadMin: g.edad_min, edadMax: g.edad_max }}
        usados={(grupos ?? []).map((x) => x.nombre)}
      />
    </div>
  );
}
