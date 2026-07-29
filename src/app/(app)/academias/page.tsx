import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { rolesForModule, can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default async function AcademiasPage() {
  const profile = await requireRole(rolesForModule("academias"));
  const supabase = await createClient();
  const { data: academias } = await supabase
    .from("academias")
    .select("id, codigo, nombre, deporte, categoria, activa")
    .order("codigo");

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
        {(academias ?? []).map((a) => (
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
            {!a.activa && <Badge variant="outline" className="mt-2">Inactiva</Badge>}
          </Link>
        ))}
        {(!academias || academias.length === 0) && (
          <p className="text-muted-foreground col-span-full py-6 text-center">
            Aún no hay academias.
          </p>
        )}
      </div>
    </div>
  );
}
