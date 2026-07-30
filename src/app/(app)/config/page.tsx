import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { ServicioForm } from "./servicio-form";
import { ServicioCard } from "./servicio-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Settings, TriangleAlert } from "lucide-react";

export default async function ConfigPage() {
  await requireRole(rolesForModule("config"));
  const supabase = await createClient();
  const { data: servicios } = await supabase
    .from("servicios")
    .select("id, clave, nombre, color, categoria_saldo, siigo_grupo, activo, orden, created_at")
    .order("orden");

  // Aviso: grupos de producto de Siigo que ningún servicio reclama.
  //
  // El sync casa las líneas de factura por el NOMBRE del grupo, así que si en
  // Siigo renombran un grupo (pasó el 30-jul-2026 con los cuatro de academia),
  // esa plata entra sin categoría y nadie se entera: los totales del club siguen
  // cuadrando y solo se desinfla la tajada de ese servicio. Esto lo saca a la luz.
  const { data: sinServicio } = await supabase
    .from("siigo_productos")
    .select("account_group")
    .is("servicio_id", null)
    .not("account_group", "is", null);
  const gruposHuerfanos = [...new Set((sinServicio ?? []).map((p) => p.account_group as string))]
    .map((g) => ({ grupo: g, productos: (sinServicio ?? []).filter((p) => p.account_group === g).length }))
    .sort((a, b) => b.productos - a.productos);

  return (
    <div className="space-y-6">
      <h1 className="cdaf-headline">Configuración</h1>

      {gruposHuerfanos.length > 0 && (
        <div className="border-destructive/40 bg-destructive/10 rounded-lg border p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <TriangleAlert className="size-4 shrink-0" />
            {gruposHuerfanos.length === 1
              ? "Hay un grupo de producto de Siigo sin servicio asignado"
              : `Hay ${gruposHuerfanos.length} grupos de producto de Siigo sin servicio asignado`}
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {gruposHuerfanos.map((g) => (
              <li key={g.grupo} className="tabular-nums">
                <strong>{g.grupo}</strong>{" "}
                <span className="text-muted-foreground">
                  · {g.productos} {g.productos === 1 ? "producto" : "productos"}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground mt-2 text-xs">
            La plata facturada con esos productos está entrando sin categoría: cuadra en el total del
            club pero no aparece en ningún servicio. Crea el servicio que falta, o corrige el campo
            &ldquo;Grupo de Siigo&rdquo; del servicio que ya existe para que coincida con el nombre de
            arriba.
          </p>
        </div>
      )}

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
