import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { mapaNombresStaff } from "@/lib/staff";
import { InscribirGrupoForm, type GrupoOpcion } from "./inscribir-grupo-form";

export default async function InscribirPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ grupo?: string }>;
}) {
  await requireRole(rolesForModule("academias", "edit"));
  const { id } = await params;
  const academiaId = Number(id);
  const sp = await searchParams;

  const supabase = await createClient();
  const { data: a } = await supabase.from("academias").select("id, nombre").eq("id", academiaId).maybeSingle();
  if (!a) notFound();

  // Grupos con su resumen + TODAS sus franjas de una vez: son 9 y 64, no hay N+1
  // que justificar y el formulario las necesita todas para pintar el paso 3.
  const [{ data: resumen }, { data: franjas }, nombres] = await Promise.all([
    supabase.rpc("academia_grupos_resumen", { p_academia: academiaId }),
    supabase
      .from("grupo_franja")
      .select("id, grupo_id, dia_semana, hora_inicio, hora_fin, profesor_id, cancha, cupo, academia_grupo!inner(academia_id, nivel)")
      .eq("academia_grupo.academia_id", academiaId)
      .eq("activo", true)
      .order("dia_semana")
      .order("hora_inicio"),
    mapaNombresStaff(),
  ]);

  const TOPE: Record<string, number> = { iniciacion: 6, intermedio: 5, avanzado: 4 };

  // Cuántos hay ya en cada franja (para decir "llena" antes de escoger).
  const ids = (franjas ?? []).map((f) => f.id);
  const { data: ocupacion } = ids.length
    ? await supabase.from("inscripcion_franja").select("franja_id").in("franja_id", ids)
    : { data: [] };
  const usados = new Map<number, number>();
  for (const o of ocupacion ?? []) usados.set(o.franja_id, (usados.get(o.franja_id) ?? 0) + 1);

  const grupos: GrupoOpcion[] = (resumen ?? []).map((g) => ({
    id: g.grupo_id,
    nombre: g.nombre,
    nivel: g.nivel,
    edadMin: g.edad_min,
    edadMax: g.edad_max,
    franjas: (franjas ?? [])
      .filter((f) => f.grupo_id === g.grupo_id)
      .map((f) => {
        const cupo = f.cupo ?? TOPE[g.nivel] ?? 4;
        return {
          id: f.id,
          dia: f.dia_semana,
          hora: f.hora_inicio.slice(0, 5),
          horaFin: f.hora_fin.slice(0, 5),
          profesor: f.profesor_id ? nombres.get(f.profesor_id) ?? null : null,
          cancha: f.cancha,
          cupo,
          usados: usados.get(f.id) ?? 0,
        };
      }),
  }));

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href={`/academias/${academiaId}`} className="text-muted-foreground text-sm hover:underline">
          ← {a.nombre}
        </Link>
        <h1 className="cdaf-headline mt-1">Inscribir un niño</h1>
      </div>
      <InscribirGrupoForm
        academiaId={academiaId}
        academiaNombre={a.nombre}
        grupos={grupos}
        grupoInicial={Number(sp.grupo) || null}
      />
    </div>
  );
}
