import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { docentesConDeporte, opcionesParaDeporte } from "@/lib/staff";
import { ClaseForm } from "../../clase-form";
import { hhmm } from "../../../ui";

export default async function EditarClasePage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(rolesForModule("academias", "edit"));
  const { id } = await params;
  const claseId = Number(id);
  const supabase = await createClient();

  const { data: c } = await supabase
    .from("clase_semanal")
    .select("id, profesor_id, deporte, dia_semana, hora_inicio, duracion_min, cancha, colegio")
    .eq("id", claseId)
    .maybeSingle();
  if (!c) notFound();

  const [{ count }, docentes] = await Promise.all([
    supabase.from("inscripcion_clase").select("*", { count: "exact", head: true }).eq("clase_id", claseId),
    docentesConDeporte(),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href={`/academias/clase/${claseId}`} className="text-muted-foreground text-sm hover:underline">
          ← Volver a la clase
        </Link>
        <h1 className="cdaf-headline mt-1">Editar clase</h1>
      </div>
      <div className="ring-foreground/[0.06] bg-card rounded-2xl p-6 shadow-md ring-1">
        <ClaseForm
          profesores={opcionesParaDeporte(docentes, c.deporte)}
          deporte={c.deporte}
          valores={{
            id: c.id,
            profesorId: c.profesor_id,
            dia: c.dia_semana,
            hora: hhmm(c.hora_inicio),
            duracion: c.duracion_min,
            cancha: c.cancha,
            colegio: c.colegio,
            ninos: count ?? 0,
          }}
        />
      </div>
    </div>
  );
}
