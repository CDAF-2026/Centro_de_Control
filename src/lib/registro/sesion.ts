import "server-only";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";

/**
 * La sesión del recorrido público: hilvana datos → consentimiento → "¿otro hijo?"
 * sin poner un solo dato personal en la URL. La cookie lleva solo el uuid de la
 * fila en `registro_sesion`; lo demás vive en la base (2 horas).
 *
 * `httpOnly` (el navegador no la lee), `secure` en producción, `sameSite=lax`,
 * y acotada a `/registro`: no viaja a ninguna otra pantalla.
 */
const COOKIE = "cdaf_registro";
const VIDA_SEG = 2 * 60 * 60;

export type MiembroSesion = { miembro_id: number; cliente_id: number; nombre: string; firmado?: boolean };
export type Firmante = { nombre: string; documento: string; parentesco?: string; celular?: string; email?: string };

export type Sesion = {
  id: string;
  firmante: Firmante | null;
  miembros: MiembroSesion[];
};

function opciones() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/registro",
    maxAge: VIDA_SEG,
  };
}

/** Crea la fila y deja la cookie. Devuelve el id. */
export async function crearSesion(firmante: Firmante | null = null): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("registro_sesion")
    .insert({ firmante: (firmante ?? null) as Json })
    .select("id")
    .single();
  if (error || !data) throw new Error(`No se pudo abrir la sesión de registro: ${error?.message}`);
  (await cookies()).set(COOKIE, data.id, opciones());
  return data.id;
}

/** La sesión de la cookie, si existe, no está cerrada y no venció. */
export async function leerSesion(): Promise<Sesion | null> {
  const id = (await cookies()).get(COOKIE)?.value;
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("registro_sesion")
    .select("id, firmante, miembros, cerrada, expira_el")
    .eq("id", id)
    .maybeSingle();
  if (!data || data.cerrada || new Date(data.expira_el).getTime() < Date.now()) return null;
  return {
    id: data.id,
    firmante: (data.firmante as Firmante | null) ?? null,
    miembros: (data.miembros as MiembroSesion[] | null) ?? [],
  };
}

/** Agrega (o actualiza) un niño procesado y, si viene, el firmante. */
export async function anotarEnSesion(
  id: string,
  cambios: { miembro?: MiembroSesion; firmante?: Firmante },
): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin.from("registro_sesion").select("miembros, firmante").eq("id", id).maybeSingle();
  if (!data) return;
  const miembros = ((data.miembros as MiembroSesion[] | null) ?? []).filter(
    (m) => !cambios.miembro || m.miembro_id !== cambios.miembro.miembro_id,
  );
  if (cambios.miembro) miembros.push(cambios.miembro);
  await admin
    .from("registro_sesion")
    .update({
      miembros: miembros as unknown as Json,
      ...(cambios.firmante ? { firmante: cambios.firmante as unknown as Json } : {}),
    })
    .eq("id", id);
}

/** "No, gracias": cierra la fila y borra la cookie. */
export async function cerrarSesion(): Promise<void> {
  const store = await cookies();
  const id = store.get(COOKIE)?.value;
  if (id && /^[0-9a-f-]{36}$/.test(id)) {
    await createAdminClient().from("registro_sesion").update({ cerrada: true }).eq("id", id);
  }
  store.delete(COOKIE);
}
