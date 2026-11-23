import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { leerPanel } from "../../datos";
import { Marco } from "../../marco";
import { ProductoEditor } from "../../producto-editor";

/**
 * Cafetería · editar un producto. Se llega con el lápiz de su tarjeta. La columna
 * de categorías sigue en su sitio. Al guardar se cierra y se vuelve a la rejilla.
 *
 * `?aviso=` lo pone la acción de crear cuando algo quedó a medias (la foto no
 * subió, o se creó sin precio) y trae a la persona aquí a terminarlo.
 */
export default async function EditarProductoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aviso?: string; de?: string }>;
}) {
  const profile = await requireRole(rolesForModule("cafeteria", "edit"));
  const [{ id }, { aviso, de }] = await Promise.all([params, searchParams]);
  const panel = await leerPanel();
  const producto = panel.productos.find((p) => String(p.id) === id);
  // Si la carta no cargó no se puede saber si el producto existe: se deja que el
  // marco muestre el error en vez de decir "no existe".
  if (!producto && !panel.error) notFound();
  // De dónde se vino (`?de=`, lo pone el lápiz de la tarjeta): una categoría, o "Todas" (null).
  // Ahí se vuelve al guardar, y es la que queda resaltada en la columna.
  const origen = panel.categorias.find((c) => String(c.id) === de)?.id ?? null;

  return (
    <Marco panel={panel} rol={profile.role} categoriaActiva={origen}>
      {producto && (
        // `key`: al pasar de un producto a otro el editor arranca de cero con los datos del nuevo.
        <ProductoEditor key={producto.id} categorias={panel.categorias} productos={panel.productos} producto={producto} volverA={origen} aviso={aviso} />
      )}
    </Marco>
  );
}
