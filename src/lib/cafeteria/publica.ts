import { createAdminClient } from "@/lib/supabase/admin";
import { fotoUrl, type CategoriaCarta } from "./carta";

/**
 * Lo que la carta pública le muestra al comprador. SOLO servidor: usa
 * service_role porque la página no tiene sesión y `anon` no puede leer estas
 * tablas (se cerraron a propósito en la migración `20261120100000`).
 *
 * Aquí vive la regla de Laura: **lo no disponible no aparece**. Tampoco lo que
 * está sin precio (la base ya impide que eso esté disponible; el filtro de
 * `precio` es un segundo candado). Una categoría sin nada disponible no se pinta.
 *
 * Devuelve `null` si la base no responde, para que la página diga "no pudimos
 * cargar la carta" en vez de mostrar una carta vacía — un fallo y una carta
 * vacía se arreglan distinto y no pueden verse iguales.
 */
export async function leerCartaPublica(): Promise<{ categorias: CategoriaCarta[]; whatsapp: string } | null> {
  const admin = createAdminClient();
  const [cats, prods, ajustes] = await Promise.all([
    admin.from("cafeteria_categorias").select("id, nombre, orden").order("orden").order("nombre"),
    admin
      .from("cafeteria_productos")
      .select("id, categoria_id, nombre, descripcion, precio, opciones, foto_path")
      .eq("disponible", true)
      .gt("precio", 0)
      .order("nombre")
      // PostgREST corta en 1.000 sin avisar; una carta no llega ni cerca, pero se
      // pide explícito para que el día que crezca el corte no sea una sorpresa.
      .limit(1000),
    admin.from("cafeteria_ajustes").select("whatsapp").maybeSingle(),
  ]);
  if (cats.error || prods.error) {
    console.error("[carta] no se pudo leer la carta", cats.error?.message ?? prods.error?.message);
    return null;
  }

  const categorias: CategoriaCarta[] = (cats.data ?? [])
    .map((c) => ({
      id: c.id,
      nombre: c.nombre,
      productos: (prods.data ?? [])
        .filter((p) => p.categoria_id === c.id)
        .map((p) => ({
          id: p.id,
          nombre: p.nombre,
          descripcion: p.descripcion,
          precio: p.precio,
          opciones: p.opciones ?? [],
          fotoUrl: fotoUrl(p.foto_path),
        })),
    }))
    .filter((c) => c.productos.length > 0);

  return { categorias, whatsapp: ajustes.data?.whatsapp ?? "" };
}
