"use server";

import { refresh } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { horaCorta } from "@/lib/fecha";
import type { TurnoAccion } from "@/lib/database.types";

export type QuioscoState = { ok: boolean; mensaje: string };

const ACCIONES: TurnoAccion[] = ["entrada", "salida", "pausa_inicio", "pausa_fin"];
const CON_FOTO: TurnoAccion[] = ["entrada", "salida"];
const FOTO_MAX_BYTES = 3 * 1024 * 1024;

/** Solo el PC de recepción. El superadministrador entra también, para poder probarlo. */
const PUEDE = ["quiosco", "superadmin"] as const;

/**
 * Comprueba el PIN sin marcar todavía.
 *
 * Se hace en un paso aparte para que un PIN equivocado se descubra ANTES de
 * abrir la cámara: tomarse la foto y que después falle el PIN es confuso y deja
 * el archivo subido para nada. La marcación lo vuelve a validar, así que saltarse
 * este paso desde el navegador no sirve de nada.
 */
export async function verificarPin(formData: FormData): Promise<QuioscoState> {
  await requireRole([...PUEDE]);

  const perfil = String(formData.get("perfil") ?? "");
  const pin = String(formData.get("pin") ?? "");
  if (!perfil) return { ok: false, mensaje: "Falta la persona." };
  if (!/^\d{4}$/.test(pin)) return { ok: false, mensaje: "El PIN son 4 dígitos." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("quiosco_pin_verificar", {
    p_perfil: perfil,
    p_pin: pin,
  });
  if (error) return { ok: false, mensaje: error.message };

  const r = data?.[0];
  return { ok: !!r?.ok, mensaje: r?.mensaje ?? "" };
}

/**
 * Marca por cuenta de otro, validando su PIN.
 *
 * ⚠️ La hora la sigue poniendo el servidor dentro de `turno_marcar`: por esta
 * puerta tampoco viaja una hora en el formulario.
 */
export async function marcarQuiosco(formData: FormData): Promise<QuioscoState> {
  await requireRole([...PUEDE]);

  const perfil = String(formData.get("perfil") ?? "");
  const pin = String(formData.get("pin") ?? "");
  const accion = String(formData.get("accion") ?? "") as TurnoAccion;
  if (!perfil) return { ok: false, mensaje: "Falta la persona." };
  if (!/^\d{4}$/.test(pin)) return { ok: false, mensaje: "El PIN son 4 dígitos." };
  if (!ACCIONES.includes(accion)) return { ok: false, mensaje: "Acción desconocida." };

  const supabase = await createClient();
  let path: string | null = null;

  if (CON_FOTO.includes(accion)) {
    const foto = formData.get("foto");
    if (!(foto instanceof File) || foto.size === 0) {
      return { ok: false, mensaje: "Falta la foto. Vuelve a intentarlo." };
    }
    if (foto.type !== "image/jpeg") {
      return { ok: false, mensaje: "La foto no tiene el formato esperado." };
    }
    if (foto.size > FOTO_MAX_BYTES) return { ok: false, mensaje: "La foto pesa demasiado." };

    // Va a la carpeta de la PERSONA, no a la del quiósco: así la foto vive con
    // sus turnos y el reporte la encuentra igual que las del celular.
    path = `${perfil}/${Date.now()}.jpg`;
    const { error } = await supabase.storage
      .from("turnos")
      .upload(path, foto, { contentType: "image/jpeg" });
    if (error) return { ok: false, mensaje: `No se pudo guardar la foto: ${error.message}` };
  }

  const { data, error } = await supabase.rpc("quiosco_marcar", {
    p_perfil: perfil,
    p_pin: pin,
    p_accion: accion,
    p_foto_path: path,
  });

  const r = data?.[0];
  if (error || !r?.ok) {
    if (path) await supabase.storage.from("turnos").remove([path]);
    return { ok: false, mensaje: r?.mensaje ?? error?.message ?? "No se pudo marcar." };
  }

  refresh();

  const ahora = horaCorta(new Date().toISOString());
  const dicho: Record<TurnoAccion, string> = {
    entrada: `Entrada registrada a las ${ahora}`,
    salida: `Salida registrada a las ${ahora}`,
    pausa_inicio: `Almuerzo desde las ${ahora}`,
    pausa_fin: `De vuelta desde las ${ahora}`,
  };
  return { ok: true, mensaje: dicho[accion] };
}
