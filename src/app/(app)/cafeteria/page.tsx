import { requireRole } from "@/lib/auth";
import { can, rolesForModule } from "@/lib/auth/permissions";
import { CartaAdmin, type AvisoCarta } from "./carta-admin";
import { leerPanel } from "./datos";
import { Marco } from "./marco";

/**
 * Cafetería · la carta (20-nov-2026, pedido de Laura). Aquí se decide qué ve el
 * comprador cuando escanea el QR: los productos en tarjetas con su foto, que se
 * prenden o apagan con un toque. Lo apagado no le aparece.
 *
 * La categoría se escoge en la columna de la izquierda y viaja en la dirección
 * (`?categoria=`), así se puede volver a ella desde el editor de un producto.
 */
export default async function CafeteriaPage({
  searchParams,
}: {
  /** `hecho`, `p`, `n` y `nota` los pone el editor al cerrarse: qué se hizo y con cuál producto. */
  searchParams: Promise<{ categoria?: string; hecho?: string; p?: string; n?: string; nota?: string }>;
}) {
  const profile = await requireRole(rolesForModule("cafeteria"));
  const { categoria, hecho, p, n, nota } = await searchParams;
  const panel = await leerPanel();

  // Una categoría que no existe (se borró, o la dirección vino mal) es "Todas".
  const activa = panel.categorias.find((c) => String(c.id) === categoria) ?? null;

  // Lo que se acaba de hacer en el editor. El nombre se lee de la carta (no de la
  // dirección) salvo al eliminar, que ya no está.
  const tocado = panel.productos.find((x) => String(x.id) === p) ?? null;
  let aviso: AvisoCarta | null = null;
  if (hecho === "guardado" && tocado) {
    aviso = {
      productoId: tocado.id,
      texto: nota === "sin_precio" ? `Guardaste «${tocado.nombre}». Quedó como no disponible porque no tiene precio.` : `Guardaste los cambios de «${tocado.nombre}».`,
    };
  } else if (hecho === "creado" && tocado) {
    aviso = { productoId: tocado.id, texto: `Agregaste «${tocado.nombre}» a la carta.` };
  } else if (hecho === "eliminado" && n) {
    aviso = { productoId: null, texto: `Eliminaste «${n.slice(0, 80)}» de la carta.` };
  }

  return (
    <Marco panel={panel} rol={profile.role} categoriaActiva={activa?.id ?? null}>
      <CartaAdmin
        // `key`: cada regreso del editor arranca con su aviso a la vista.
        key={aviso ? `${hecho}-${p ?? n}` : "carta"}
        categorias={activa ? [activa] : panel.categorias}
        productos={panel.productos}
        puedeEditar={can(profile.role, "cafeteria", "edit")}
        categoriaActiva={activa?.id ?? null}
        aviso={aviso}
      />
    </Marco>
  );
}
