import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { ServicioForm } from "./servicio-form";
import { ServicioCard } from "./servicio-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Settings } from "lucide-react";

export default async function ConfigPage() {
  await requireRole(rolesForModule("config"));
  const supabase = await createClient();
  const { data: servicios } = await supabase
    .from("servicios")
    .select("id, clave, nombre, color, categoria_saldo, activo, orden, created_at")
    .order("orden");

  return (
    <div className="space-y-6">
      <h1 className="cdaf-headline">Configuración</h1>

      <section className="space-y-3">
        <div>
          <h2 className="cdaf-title">Servicios / centros de costo</h2>
          <p className="text-muted-foreground text-sm">
            Categorías de ingreso del centro. Se usan al registrar y conciliar pagos, y en reportes y dashboard.
            Marca <strong>¿Genera saldo?</strong> en los servicios que se concilian contra lo esperado del cliente
            (academias, paquetes, clases particulares); los demás son solo informativos.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(servicios ?? []).map((s) => (
            <ServicioCard key={s.id} servicio={s} />
          ))}
          {(!servicios || servicios.length === 0) && (
            <div className="col-span-full">
              <EmptyState icon={Settings} title="Sin servicios" description="Crea el primero más abajo." />
            </div>
          )}
        </div>

        <div className="max-w-3xl border-t pt-4">
          <h3 className="cdaf-title mb-3">Nuevo servicio</h3>
          <ServicioForm />
        </div>
      </section>
    </div>
  );
}
