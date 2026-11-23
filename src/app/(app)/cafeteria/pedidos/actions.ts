"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { logAudit } from "@/lib/audit";
import { esEstado } from "@/lib/cafeteria/estado";
import { createClient } from "@/lib/supabase/server";

const BASE = "/cafeteria/pedidos";

/**
 * De vuelta a la lista de donde se vino (por atender o historial, con su
 * periodo y su página), con el resultado en la dirección para que la pantalla
 * lo diga. Solo se acepta una ruta de esta misma pantalla.
 */
function volver(formData: FormData, resultado: Record<string, string>): never {
  const pedida = String(formData.get("volver") ?? "");
  const url = new URL(pedida.startsWith(BASE) ? pedida : BASE, "http://local");
  for (const clave of ["hecho", "antes", "error"]) url.searchParams.delete(clave);
  for (const [clave, valor] of Object.entries(resultado)) url.searchParams.set(clave, valor);
  redirect(`${url.pathname}${url.search}`);
}

/**
 * Cambia el estado de un pedido (pendiente · en preparación · entregado ·
 * cancelado). Lo llaman los botones de cada tarjeta y el "Deshacer" del aviso.
 *
 * La escritura va por la función `cafeteria_pedido_estado`: `cafeteria_pedidos`
 * no tiene permiso de UPDATE para nadie (una política no puede limitar
 * columnas), y un UPDATE directo fallaría. La función valida el rol por dentro,
 * así que hay tres capas: el menú, este `requireRole` y la base.
 */
export async function cambiarEstadoPedido(formData: FormData): Promise<void> {
  await requireRole(rolesForModule("cafeteria", "edit"));

  const id = Number(formData.get("id"));
  const estado = formData.get("estado");
  if (!Number.isInteger(id) || id <= 0 || !esEstado(estado)) volver(formData, { error: "1" });

  const supabase = await createClient();
  const { data: antes, error } = await supabase.rpc("cafeteria_pedido_estado", { p_pedido: id, p_estado: estado });
  if (error) {
    console.error("[cafetería] no se pudo cambiar el estado del pedido", id, error.message);
    volver(formData, { error: "1" });
  }

  await logAudit({
    action: "cafeteria.pedido.estado",
    entity: "cafeteria_pedidos",
    entityId: String(id),
    before: { estado: antes },
    after: { estado },
  });
  revalidatePath(BASE);

  // Al deshacer no se vuelve a ofrecer "Deshacer": sería un vaivén sin fin.
  const deshaciendo = formData.get("deshacer") === "1";
  volver(formData, { hecho: String(id), ...(deshaciendo || antes === estado ? {} : { antes: String(antes) }) });
}
