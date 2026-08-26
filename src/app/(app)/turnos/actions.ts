"use server";

import { refresh } from "next/cache";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { horaCorta } from "@/lib/fecha";
import type { TurnoAccion } from "@/lib/database.types";

export type MarcarState = { error?: string; ok?: string };

const ACCIONES: TurnoAccion[] = ["entrada", "salida", "pausa_inicio", "pausa_fin"];
/** Entrar y salir llevan foto; el almuerzo no (decisión de Laura: dos toques, sin cámara). */
const CON_FOTO: TurnoAccion[] = ["entrada", "salida"];

/** Tope de la foto. La cámara manda ~60 KB; esto es solo para atajar un envío raro. */
const FOTO_MAX_BYTES = 3 * 1024 * 1024;

/**
 * Marca entrada, salida o almuerzo.
 *
 * ⚠️ La HORA no viaja en el formulario y no debe hacerlo nunca: la estampa el
 * servidor dentro de `turno_marcar` (SECURITY DEFINER, migración 0080). Si
 * viniera del navegador bastaría con atrasarle el reloj al celular para marcar
 * entrada a las 6 a. m.
 *
 * Aquí se valida el ROL; que la persona esté habilitada para marcar
 * (`profiles.marca_turno`) y el orden de las marcaciones los valida la función
 * de la base, que es la única puerta de escritura que existe.
 */
export async function marcar(formData: FormData): Promise<MarcarState> {
  const profile = await requireRole(rolesForModule("turnos", "edit"));

  const accion = String(formData.get("accion") ?? "") as TurnoAccion;
  if (!ACCIONES.includes(accion)) return { error: "Acción desconocida." };

  const supabase = await createClient();
  let path: string | null = null;

  if (CON_FOTO.includes(accion)) {
    const foto = formData.get("foto");
    if (!(foto instanceof File) || foto.size === 0) {
      return { error: "Falta la foto. Vuelve a intentarlo." };
    }
    if (foto.type !== "image/jpeg") return { error: "La foto no tiene el formato esperado." };
    if (foto.size > FOTO_MAX_BYTES) return { error: "La foto pesa demasiado." };

    // La carpeta debe llamarse como el id: es lo que exige la política del bucket.
    path = `${profile.id}/${Date.now()}.jpg`;
    const { error } = await supabase.storage
      .from("turnos")
      .upload(path, foto, { contentType: "image/jpeg" });
    if (error) return { error: `No se pudo guardar la foto: ${error.message}` };
  }

  const { error } = await supabase.rpc("turno_marcar", {
    p_accion: accion,
    p_foto_path: path,
  });

  if (error) {
    // La foto ya está subida pero el turno no se registró: se borra para no
    // dejar archivos huérfanos que después nadie sabe de dónde salieron.
    if (path) await supabase.storage.from("turnos").remove([path]);
    return { error: error.message };
  }

  // Refresca la pantalla para que el estado (y los botones) reflejen la marca.
  refresh();

  const ahora = horaCorta(new Date().toISOString());
  const mensajes: Record<TurnoAccion, string> = {
    entrada: `Turno iniciado a las ${ahora}.`,
    salida: `Turno cerrado a las ${ahora}.`,
    pausa_inicio: `Almuerzo desde las ${ahora}.`,
    pausa_fin: `De vuelta desde las ${ahora}.`,
  };
  return { ok: mensajes[accion] };
}
