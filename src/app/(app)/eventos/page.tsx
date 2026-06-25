import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { rolesForModule, can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Trophy } from "lucide-react";

const TIPO_LABEL: Record<string, string> = { torneo: "Torneo", clinica: "Clínica", masterclass: "Masterclass", otro: "Otro" };
const ESTADO_LABEL: Record<string, string> = { planeado: "Planeado", en_curso: "En curso", finalizado: "Finalizado", cancelado: "Cancelado" };

export default async function EventosPage() {
  const profile = await requireRole(rolesForModule("eventos"));
  const supabase = await createClient();
  const { data: eventos } = await supabase
    .from("eventos")
    .select("id, nombre, tipo, deporte, fecha_inicio, fecha_fin, estado")
    .order("fecha_inicio", { ascending: false });
  const puedeEditar = can(profile.role, "eventos", "edit");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="cdaf-headline">Eventos</h1>
        {puedeEditar && (
          <Link href="/eventos/nuevo" className={buttonVariants({ size: "sm" })}>Nuevo evento</Link>
        )}
      </div>
      <p className="text-muted-foreground text-sm">
        Torneos, clínicas y masterclass. Los ingresos entran por la bolsa de pagos y la remuneración de
        profesores va a Liquidación (sin contar como clases).
      </p>

      {(eventos ?? []).length > 0 ? (
        <div className="cdaf-table-wrap">
          <table className="cdaf-table">
            <thead>
              <tr>
                <th className="px-4 py-2">Evento</th>
                <th className="px-4 py-2">Tipo</th>
                <th className="px-4 py-2">Fecha</th>
                <th className="px-4 py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {(eventos ?? []).map((e) => (
                <tr key={e.id} className="border-t">
                  <td className="px-4 py-2">
                    <Link href={`/eventos/${e.id}`} className="font-medium hover:underline">{e.nombre}</Link>
                    {e.deporte && <span className="text-muted-foreground"> · {e.deporte}</span>}
                  </td>
                  <td className="px-4 py-2">{TIPO_LABEL[e.tipo] ?? e.tipo}</td>
                  <td className="px-4 py-2">
                    {e.fecha_inicio}
                    {e.fecha_fin ? ` → ${e.fecha_fin}` : ""}
                  </td>
                  <td className="px-4 py-2">
                    <Badge variant="outline">{ESTADO_LABEL[e.estado] ?? e.estado}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={Trophy} title="Sin eventos" description="Crea el primer torneo, clínica o masterclass." />
      )}
    </div>
  );
}
