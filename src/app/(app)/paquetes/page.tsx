import { requireRole } from "@/lib/auth";
import { rolesForModule, can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { CatalogoForm } from "./catalogo-form";
import { CatalogoCard, type PaqueteCatalogo } from "./catalogo-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, Package } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Catálogo de paquetes, partido por deporte para que se lea de un vistazo
 * (Laura, 30-sep-2026). Los inactivos van TODOS al final, en gris y con
 * candado: siguen existiendo por el historial de sus clientes, pero no se
 * ofrecen al asignar.
 */
export default async function PaquetesPage() {
  const profile = await requireRole(rolesForModule("paquetes"));
  const supabase = await createClient();
  const { data } = await supabase
    .from("paquetes_catalogo")
    .select("id, nombre, deporte, num_clases, activo")
    .order("num_clases")
    .order("nombre");
  const catalogo: PaqueteCatalogo[] = data ?? [];

  const puedeConfig = can(profile.role, "paquetes", "edit");
  const puedeEliminar = profile.role === "superadmin";

  const activos = catalogo.filter((p) => p.activo);
  const inactivos = catalogo.filter((p) => !p.activo);
  const secciones: { clave: string; titulo: string; descripcion: string; items: PaqueteCatalogo[] }[] = [
    { clave: "padel", titulo: "Pádel", descripcion: "Bonos de clases particulares de pádel.", items: activos.filter((p) => p.deporte === "padel") },
    { clave: "tenis", titulo: "Tenis", descripcion: "Bonos de clases particulares de tenis.", items: activos.filter((p) => p.deporte === "tenis") },
  ];
  const ambos = activos.filter((p) => p.deporte == null);
  if (ambos.length > 0) {
    secciones.push({ clave: "ambos", titulo: "Ambos deportes", descripcion: "Sirven para pádel o tenis.", items: ambos });
  }

  const grid = (items: PaqueteCatalogo[]) => (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((p) => (
        <CatalogoCard key={p.id} paquete={p} puedeConfig={puedeConfig} puedeEliminar={puedeEliminar} />
      ))}
    </div>
  );

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="cdaf-headline">Paquetes de clases</h1>
          <p className="text-muted-foreground max-w-2xl text-sm">
            Aquí se define qué paquetes existen: deporte, número de clases y personas. El precio no
            va aquí, se digita al asignarle el paquete a cada cliente en su ficha.
          </p>
        </div>
        <Resumen activos={activos.length} inactivos={inactivos.length} />
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="space-y-10">
          {secciones.map((s) => (
            <Seccion key={s.clave} titulo={s.titulo} descripcion={s.descripcion} cantidad={s.items.length}>
              {s.items.length > 0 ? (
                grid(s.items)
              ) : (
                <EmptyState
                  icon={Package}
                  title={`Sin paquetes de ${s.titulo.toLowerCase()}`}
                  description={puedeConfig ? "Créalo con el formulario de la derecha." : undefined}
                  className="bg-card rounded-xl py-8 shadow-sm ring-1 ring-foreground/[0.06]"
                />
              )}
            </Seccion>
          ))}

          {inactivos.length > 0 && (
            <Seccion
              titulo="Inactivos"
              descripcion="No se ofrecen al asignar. Se conservan porque algún cliente los tuvo; si ninguno los tiene, el superadministrador puede eliminarlos."
              cantidad={inactivos.length}
              icono={<Lock className="size-4" />}
            >
              {grid(inactivos)}
            </Seccion>
          )}
        </div>

        {puedeConfig && (
          <Card className="lg:sticky lg:top-24">
            <CardHeader>
              <CardTitle>Nuevo paquete</CardTitle>
              <CardDescription>
                Pon en el nombre el deporte, las clases y las personas, p. ej. «Pádel 8 clases · 2 personas».
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CatalogoForm />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function Resumen({ activos, inactivos }: { activos: number; inactivos: number }) {
  return (
    <dl className="flex items-center gap-6 text-sm">
      <div className="flex items-baseline gap-2">
        <dd className="font-heading text-2xl font-semibold tabular-nums">{activos}</dd>
        <dt className="text-muted-foreground">activos</dt>
      </div>
      {inactivos > 0 && (
        <div className="flex items-baseline gap-2">
          <dd className="font-heading text-muted-foreground text-2xl font-semibold tabular-nums">{inactivos}</dd>
          <dt className="text-muted-foreground">inactivos</dt>
        </div>
      )}
    </dl>
  );
}

function Seccion({
  titulo,
  descripcion,
  cantidad,
  icono,
  children,
}: {
  titulo: string;
  descripcion: string;
  cantidad: number;
  icono?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-4 border-b pb-3">
        <div>
          <h2 className="cdaf-title flex items-center gap-2">
            {icono}
            {titulo}
          </h2>
          <p className="text-muted-foreground text-sm">{descripcion}</p>
        </div>
        <span className="text-muted-foreground shrink-0 text-sm tabular-nums">
          {cantidad} {cantidad === 1 ? "paquete" : "paquetes"}
        </span>
      </div>
      {children}
    </section>
  );
}
