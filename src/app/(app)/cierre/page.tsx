import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

export default async function CierrePage() {
  const profile = await requireRole(rolesForModule("cierre_clase"));
  const esProfesor = profile.role === "profesor";

  const supabase = await createClient();
  let q = supabase
    .from("clases")
    .select("id, fecha, hora_inicio, tipo, deporte, profesor_id")
    .eq("estado", "programada")
    .order("fecha");
  if (esProfesor) q = q.eq("profesor_id", profile.id);
  const { data: clases } = await q;

  const now = Date.now();

  return (
    <div className="space-y-6">
      <h1 className="cdaf-headline">
        {esProfesor ? "Mis clases por cerrar" : "Clases pendientes de cierre"}
      </h1>

      {(!clases || clases.length === 0) && (
        <p className="text-muted-foreground">No hay clases pendientes. 🎾</p>
      )}

      <div className="space-y-2">
        {(clases ?? []).map((c) => {
          const dt = new Date(`${c.fecha}T${c.hora_inicio ?? "23:59"}:00`);
          const vencida = now > dt.getTime() + 24 * 3600 * 1000;
          return (
            <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <p className="font-medium">
                  {c.fecha} {c.hora_inicio?.slice(0, 5) ?? ""} ·{" "}
                  {c.tipo === "academia" ? "Academia" : "Individual"}
                  {c.deporte ? ` · ${c.deporte}` : ""}
                </p>
                {vencida && (
                  <Badge variant="destructive" className="mt-1">
                    +24 h sin cerrar
                  </Badge>
                )}
              </div>
              <Link href={`/cierre/${c.id}`} className={buttonVariants({ size: "sm" })}>
                Cerrar
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
