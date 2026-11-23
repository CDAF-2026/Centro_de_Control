import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { leerPanel } from "../../datos";
import { Marco } from "../../marco";
import { ProductoEditor } from "../../producto-editor";

/**
 * Cafetería · nuevo producto. El mismo editor de siempre, vacío, con el celular
 * de "Así lo ve el comprador" al lado. Si se llega desde una categoría
 * (`?categoria=`), viene escogida.
 */
export default async function NuevoProductoPage({ searchParams }: { searchParams: Promise<{ categoria?: string }> }) {
  const profile = await requireRole(rolesForModule("cafeteria", "edit"));
  const { categoria } = await searchParams;
  const panel = await leerPanel();
  // De dónde se vino: una categoría escogida en la columna, o "Todas" (null). Ahí se vuelve al guardar.
  const origen = panel.categorias.find((c) => String(c.id) === categoria) ?? null;
  const inicial = origen ?? panel.categorias[0] ?? null;

  return (
    <Marco panel={panel} rol={profile.role} categoriaActiva={origen?.id ?? null}>
      {panel.categorias.length === 0 ? (
        <p className="bg-card text-muted-foreground rounded-xl p-6 text-sm shadow-sm ring-1 ring-foreground/[0.06]">
          Crea primero una categoría en la columna de la izquierda («Nueva categoría»): todo producto va dentro de una.
        </p>
      ) : (
        <ProductoEditor categorias={panel.categorias} productos={panel.productos} categoriaInicial={inicial?.id} volverA={origen?.id ?? null} />
      )}
    </Marco>
  );
}
