import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { CatalogoForm } from "./catalogo-form";
import { CatalogoCard } from "./catalogo-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Package } from "lucide-react";

export default async function PaquetesPage() {
  const profile = await requireRole(rolesForModule("paquetes"));
  const supabase = await createClient();
  const { data: catalogo } = await supabase
    .from("paquetes_catalogo")
    .select("id, nombre, deporte, num_clases, precio, descuento_pct, activo")
    .order("num_clases");

  const puedeConfig = ["superadmin", "coord_admin"].includes(profile.role);

  return (
    <div className="space-y-6">
      <h1 className="cdaf-headline">Paquetes de clases</h1>
      <p className="text-muted-foreground text-sm">
        Catálogo de bonos de clases particulares. La asignación a clientes se hace al conciliar
        pagos (Sprint 4) y el consumo al registrar clases (Sprint 3).
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(catalogo ?? []).map((p) => (
          <CatalogoCard key={p.id} paquete={p} puedeConfig={puedeConfig} />
        ))}
        {(!catalogo || catalogo.length === 0) && (
          <div className="col-span-full">
            <EmptyState icon={Package} title="Sin paquetes configurados" description="Crea el primero más abajo." />
          </div>
        )}
      </div>

      {puedeConfig && (
        <div className="max-w-lg border-t pt-6">
          <h2 className="cdaf-title mb-3">Nuevo paquete</h2>
          <CatalogoForm />
        </div>
      )}
    </div>
  );
}
