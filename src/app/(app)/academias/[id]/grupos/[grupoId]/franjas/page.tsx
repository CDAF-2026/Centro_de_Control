import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { profesoresActivos } from "@/lib/staff";
import { NIVELES_GRUPO } from "@/lib/validations/academia";
import { NIVEL_LABEL } from "../../../../ocupacion";
import { FranjasEditor, type FranjaEdit } from "./franjas-editor";

export default async function FranjasDelGrupoPage({
  params,
}: {
  params: Promise<{ id: string; grupoId: string }>;
}) {
  await requireRole(rolesForModule("academias", "edit"));
  const { id, grupoId } = await params;
  const academiaId = Number(id);
  const gid = Number(grupoId);
  const supabase = await createClient();

  const { data: g } = await supabase
    .from("academia_grupo")
    .select("id, academia_id, nombre, nivel")
    .eq("id", gid)
    .maybeSingle();
  if (!g || g.academia_id !== academiaId) notFound();

  // El RPC ya resuelve el cupo efectivo y cuántos hay inscritos por franja; aquí
  // hace falta además el `cupo` CRUDO (null = el del nivel) para poder editarlo.
  const [{ data: resumen }, { data: crudas }, profes] = await Promise.all([
    supabase.rpc("grupo_franjas", { p_grupo: gid }),
    supabase.from("grupo_franja").select("id, cupo").eq("grupo_id", gid),
    profesoresActivos(),
  ]);

  const cupoCrudo = new Map((crudas ?? []).map((f) => [f.id, f.cupo]));
  const franjas: FranjaEdit[] = (resumen ?? []).map((f) => ({
    id: f.franja_id,
    dia: f.dia_semana,
    horaInicio: f.hora_inicio,
    horaFin: f.hora_fin,
    profesorId: f.profesor_id,
    cancha: f.cancha,
    cupo: cupoCrudo.get(f.franja_id) ?? null,
    inscritos: f.inscritos,
  }));
  const cupoNivel = NIVELES_GRUPO.find((n) => n.value === g.nivel)?.cupo ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/academias/${academiaId}/grupos/${gid}`} className="text-muted-foreground text-sm hover:underline">
          ← {g.nombre}
        </Link>
        <h1 className="cdaf-headline mt-1">Franjas de {g.nombre}</h1>
        <p className="text-muted-foreground mt-1.5 text-sm">
          Cada franja es una venida a la semana: día, hora, profesor y cancha. Nivel{" "}
          {(NIVEL_LABEL[g.nivel] ?? g.nivel).toLowerCase()} · tope de {cupoNivel} niños.
        </p>
      </div>

      <FranjasEditor
        academiaId={academiaId}
        grupoId={gid}
        franjas={franjas}
        profesores={profes}
        cupoNivel={cupoNivel}
      />
    </div>
  );
}
