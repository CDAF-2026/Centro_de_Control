import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { CatalogoForm } from "./catalogo-form";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

export default async function PaquetesPage() {
  const profile = await requireRole(rolesForModule("paquetes"));
  const supabase = await createClient();
  const { data: catalogo } = await supabase
    .from("paquetes_catalogo")
    .select("id, nombre, deporte, num_clases, precio, activo")
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
          <div key={p.id} className="rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{p.nombre}</span>
              {p.deporte && <Badge variant="outline">{p.deporte}</Badge>}
            </div>
            <p className="mt-1 text-2xl font-semibold">
              {p.num_clases} <span className="text-muted-foreground text-sm">clases</span>
            </p>
            <p className="text-muted-foreground text-sm">{COP.format(p.precio)}</p>
            {!p.activo && <Badge variant="outline" className="mt-2">Inactivo</Badge>}
          </div>
        ))}
        {(!catalogo || catalogo.length === 0) && (
          <p className="text-muted-foreground col-span-full py-6 text-center">
            Sin paquetes configurados.
          </p>
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
