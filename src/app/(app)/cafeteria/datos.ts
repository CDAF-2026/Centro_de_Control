import { createClient } from "@/lib/supabase/server";
import { fotoUrl, type CategoriaAdmin, type ProductoAdmin } from "@/lib/cafeteria/carta";

/**
 * Lo que necesitan las tres pantallas del panel (la carta, crear y editar): las
 * categorías en su orden, TODOS los productos y el WhatsApp. Una sola lectura
 * compartida, para que la cabecera y la columna de categorías cuenten igual en
 * todas partes.
 *
 * Devuelve `error` en vez de lanzar: una carta que no cargó y una carta vacía se
 * arreglan distinto y no pueden verse iguales, así que cada pantalla lo dice.
 */
export type PanelCafeteria = {
  categorias: CategoriaAdmin[];
  productos: ProductoAdmin[];
  whatsapp: string;
  /** Cuántos productos tiene cada categoría (id → número). */
  conteo: Record<number, number>;
  cifras: { total: number; disponibles: number; noDisponibles: number; sinFoto: number };
  error: string | null;
};

export async function leerPanel(): Promise<PanelCafeteria> {
  const supabase = await createClient();
  const [cats, prods, ajustes] = await Promise.all([
    supabase.from("cafeteria_categorias").select("id, nombre, orden").order("orden").order("nombre"),
    supabase
      .from("cafeteria_productos")
      .select("id, categoria_id, nombre, descripcion, precio, opciones, foto_path, disponible")
      .order("nombre")
      // PostgREST corta en 1.000 sin avisar. Una carta no llega ni cerca; se pide
      // explícito para que el corte, si algún día llega, no sea una sorpresa.
      .limit(1000),
    supabase.from("cafeteria_ajustes").select("whatsapp").maybeSingle(),
  ]);

  const categorias: CategoriaAdmin[] = cats.data ?? [];
  const productos: ProductoAdmin[] = (prods.data ?? []).map((p) => ({
    id: p.id,
    categoriaId: p.categoria_id,
    nombre: p.nombre,
    descripcion: p.descripcion,
    precio: p.precio,
    opciones: p.opciones ?? [],
    fotoPath: p.foto_path,
    fotoUrl: fotoUrl(p.foto_path),
    disponible: p.disponible,
  }));

  const conteo: Record<number, number> = {};
  for (const p of productos) conteo[p.categoriaId] = (conteo[p.categoriaId] ?? 0) + 1;
  const disponibles = productos.filter((p) => p.disponible).length;

  return {
    categorias,
    productos,
    whatsapp: ajustes.data?.whatsapp ?? "",
    conteo,
    cifras: {
      total: productos.length,
      disponibles,
      noDisponibles: productos.length - disponibles,
      sinFoto: productos.filter((p) => !p.fotoPath).length,
    },
    error: cats.error?.message ?? prods.error?.message ?? null,
  };
}
