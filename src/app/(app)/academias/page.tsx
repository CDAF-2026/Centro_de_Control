import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { rolesForModule, can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { rangoPeriodo } from "@/lib/periodo";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default async function AcademiasPage() {
  const profile = await requireRole(rolesForModule("academias"));
  const supabase = await createClient();
  const { data: academias } = await supabase
    .from("academias")
    .select("id, codigo, nombre, deporte, categoria, activa")
    .order("codigo");

  const lista = academias ?? [];
  // Mes en curso: el detalle por periodo vive dentro de cada academia; aquí solo
  // hace falta el titular que dice a cuál entrar.
  const { curStartIso, curEndIso } = rangoPeriodo("mes", new Date());

  // Un resumen por academia: cuántos niños y cuántas franjas están en problemas.
  // El detalle (y el filtro de periodo) vive adentro; esto es solo el panorama.
  const resumen = new Map<number, { inscritos: number; enRiesgo: number }>();
  await Promise.all(
    lista.map(async (a) => {
      const [{ count }, { data: franjas }] = await Promise.all([
        supabase
          .from("inscripciones")
          .select("*", { count: "exact", head: true })
          .eq("academia_id", a.id)
          .eq("activa", true),
        supabase.rpc("academia_rendimiento_franja", {
          p_academia: a.id,
          p_desde: curStartIso,
          p_hasta: curEndIso,
        }),
      ]);
      // En riesgo = franja con niños inscritos que o no tuvo clases, o tuvo menos
      // de la mitad de asistencia.
      const enRiesgo = (franjas ?? []).filter((f) => {
        if (f.dia_semana === null || f.inscritos === 0) return false;
        if (f.clases_cerradas === 0) return f.clases_sin_cerrar === 0;
        return f.presentes / (f.clases_cerradas * f.inscritos) < 0.5;
      }).length;
      resumen.set(a.id, { inscritos: count ?? 0, enRiesgo });
    }),
  );

  const puedeEditar = can(profile.role, "academias", "edit");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="cdaf-headline">Academias</h1>
        {puedeEditar && (
          <Link href="/academias/nueva" className={buttonVariants()}>
            + Nueva academia
          </Link>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {lista.map((a) => {
          const r = resumen.get(a.id);
          return (
            <Link
              key={a.id}
              href={`/academias/${a.id}`}
              className="hover:border-lime block rounded-lg border p-4 transition-all hover:-translate-y-1"
            >
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground font-mono text-xs">{a.codigo}</span>
                <Badge variant={a.deporte === "tenis" ? "secondary" : "outline"}>
                  {a.deporte}
                </Badge>
              </div>
              <p className="mt-2 font-semibold">{a.nombre}</p>
              <p className="text-muted-foreground text-sm capitalize">{a.categoria ?? "—"}</p>

              <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3 text-sm">
                <span className="tabular-nums">
                  <strong>{r?.inscritos ?? 0}</strong>{" "}
                  <span className="text-muted-foreground">
                    {(r?.inscritos ?? 0) === 1 ? "inscrito" : "inscritos"}
                  </span>
                </span>
                {r && r.enRiesgo > 0 && (
                  <Badge variant="destructive">
                    {r.enRiesgo} {r.enRiesgo === 1 ? "franja en riesgo" : "franjas en riesgo"}
                  </Badge>
                )}
              </div>

              {!a.activa && <Badge variant="outline" className="mt-2">Inactiva</Badge>}
            </Link>
          );
        })}
        {lista.length === 0 && (
          <p className="text-muted-foreground col-span-full py-6 text-center">
            Aún no hay academias.
          </p>
        )}
      </div>

      <p className="text-muted-foreground text-xs">
        &ldquo;Franja en riesgo&rdquo; = un día y hora con niños inscritos que este mes no tuvo clases,
        o tuvo menos de la mitad de asistencia. Entra a la academia para ver el detalle y cambiar el
        periodo.
      </p>
    </div>
  );
}
