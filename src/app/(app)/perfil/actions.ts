"use server";

import { revalidatePath } from "next/cache";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import {
  datosPerfilSchema,
  cambiarCorreoSchema,
  cambiarPasswordSchema,
  FOTO_MAX_BYTES,
  FOTO_TIPOS,
} from "@/lib/validations/perfil";

export type PerfilState = {
  error?: string;
  ok?: string;
  fieldErrors?: Record<string, string>;
};

function errores(issues: readonly { path: PropertyKey[]; message: string }[]): PerfilState {
  const fieldErrors: Record<string, string> = {};
  for (const i of issues) fieldErrors[String(i.path[0])] = i.message;
  return { error: "Revisa los campos.", fieldErrors };
}

/**
 * Comprueba la contraseña actual SIN tocar la sesión abierta.
 *
 * Se usa un cliente desechable (`persistSession: false`): si se usara el cliente
 * del servidor, un `signInWithPassword` reescribiría las cookies de sesión de
 * quien está navegando. Aquí solo queremos la respuesta sí/no.
 */
async function claveCorrecta(email: string, password: string): Promise<boolean> {
  const tmp = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error } = await tmp.auth.signInWithPassword({ email, password });
  return !error;
}

/** Nombre y teléfono propios. Cualquier rol, sobre su propio perfil. */
export async function guardarDatosPerfil(
  _prev: PerfilState,
  formData: FormData,
): Promise<PerfilState> {
  const perfil = await requireProfile();

  const parsed = datosPerfilSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return errores(parsed.error.issues);

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ nombre: parsed.data.nombre, telefono: parsed.data.telefono || null })
    .eq("id", perfil.id);
  if (error) return { error: error.message };

  // El nombre se pinta en el encabezado de todas las pantallas.
  revalidatePath("/", "layout");
  return { ok: "Datos guardados." };
}

/** Sube (o reemplaza) la foto de perfil. */
export async function subirFotoPerfil(
  _prev: PerfilState,
  formData: FormData,
): Promise<PerfilState> {
  const perfil = await requireProfile();

  const archivo = formData.get("foto");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { error: "Selecciona una imagen." };
  }
  if (!FOTO_TIPOS.includes(archivo.type)) {
    return { error: "La foto debe ser JPG, PNG o WEBP." };
  }
  if (archivo.size > FOTO_MAX_BYTES) {
    return { error: "La foto supera 2 MB." };
  }

  const supabase = await createClient();
  // La carpeta debe llamarse como el id: es lo que exige la política del bucket.
  const ext = archivo.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${perfil.id}/${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage.from("avatares").upload(path, archivo);
  if (upErr) return { error: upErr.message };

  const { error: dbErr } = await supabase
    .from("profiles")
    .update({ avatar_path: path })
    .eq("id", perfil.id);
  if (dbErr) {
    await supabase.storage.from("avatares").remove([path]);
    return { error: dbErr.message };
  }

  // La anterior ya no la referencia nadie: se borra para no dejar basura.
  if (perfil.avatar_path) {
    await supabase.storage.from("avatares").remove([perfil.avatar_path]);
  }

  revalidatePath("/", "layout");
  return { ok: "Foto actualizada." };
}

/** Quita la foto y vuelve a las iniciales. */
export async function quitarFotoPerfil(): Promise<void> {
  const perfil = await requireProfile();
  if (!perfil.avatar_path) return;

  const supabase = await createClient();
  await supabase.from("profiles").update({ avatar_path: null }).eq("id", perfil.id);
  await supabase.storage.from("avatares").remove([perfil.avatar_path]);

  revalidatePath("/", "layout");
}

/**
 * Cambia el correo propio (el que se usa para entrar).
 *
 * Se pide la contraseña actual como prueba de identidad y el cambio queda
 * aplicado de una vez (Admin API). Lo habitual sería mandar un enlace de
 * confirmación al correo nuevo, pero hoy los correos de Supabase no están
 * conectados a Resend, así que ese enlace no llegaría y el cambio quedaría
 * colgado. Cuando se conecte el envío, este es el punto a cambiar.
 */
export async function cambiarMiCorreo(
  _prev: PerfilState,
  formData: FormData,
): Promise<PerfilState> {
  const perfil = await requireProfile();

  const parsed = cambiarCorreoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return errores(parsed.error.issues);

  const admin = createAdminClient();
  const { data: actual } = await admin.auth.admin.getUserById(perfil.id);
  const correoActual = actual?.user?.email ?? "";
  if (!correoActual) return { error: "Tu cuenta no tiene correo registrado." };

  if (!(await claveCorrecta(correoActual, parsed.data.password))) {
    return { error: "La contraseña no es correcta.", fieldErrors: { password: "Contraseña incorrecta" } };
  }

  const { error } = await admin.auth.admin.updateUserById(perfil.id, {
    email: parsed.data.email,
    email_confirm: true,
  });
  if (error) {
    return {
      error: /registered|exists/i.test(error.message)
        ? "Ese correo ya está en uso por otra cuenta."
        : error.message,
    };
  }

  await logAudit({
    action: "perfil.correo.update",
    entity: "profiles",
    entityId: perfil.id,
    after: { email: parsed.data.email },
  });

  revalidatePath("/perfil");
  return { ok: "Correo actualizado. Con este entras la próxima vez." };
}

/** Cambia la contraseña propia (pidiendo la actual). */
export async function cambiarMiPassword(
  _prev: PerfilState,
  formData: FormData,
): Promise<PerfilState> {
  const perfil = await requireProfile();

  const parsed = cambiarPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return errores(parsed.error.issues);

  const admin = createAdminClient();
  const { data: u } = await admin.auth.admin.getUserById(perfil.id);
  const correo = u?.user?.email ?? "";
  if (!correo) return { error: "Tu cuenta no tiene correo registrado." };

  if (!(await claveCorrecta(correo, parsed.data.actual))) {
    return { error: "La contraseña actual no es correcta.", fieldErrors: { actual: "Contraseña incorrecta" } };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.nueva });
  if (error) return { error: error.message };

  await logAudit({ action: "perfil.password.update", entity: "profiles", entityId: perfil.id });

  return { ok: "Contraseña actualizada." };
}
