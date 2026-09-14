"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { rutaInicio } from "@/lib/auth/permissions";
import { MSG_SIN_ACCESO, MSG_SISTEMA, mensajeLogin } from "@/lib/auth/mensajes";

export type LoginState = { error?: string };

/** Inicia sesión con correo y contraseña (Supabase Auth). */
export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { error: "Ingresa correo y contraseña." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  // El mensaje depende de QUÉ falló: la clave, la cuenta o el sistema. Ver
  // `mensajes.ts` — decirlo todo igual manda a la persona a arreglar lo que no es.
  if (error) return { error: mensajeLogin(error) };

  // La clave era correcta, pero la cuenta puede estar dada de baja. Se corta
  // aquí para dar un mensaje claro; si no, `requireProfile` lo devolvería al
  // login sin explicar por qué y parecería un error del sistema.
  const { data: perfil, error: errorPerfil } = await supabase
    .from("profiles")
    .select("activo, role")
    .eq("id", data.user.id)
    .single();
  // Si la lectura falla no se SABE si tiene acceso, así que decirle "ya no
  // tienes acceso" sería inventar. Mismo veneno que el mensaje de arriba: una
  // lectura caída y una cuenta cerrada se veían idénticas.
  if (errorPerfil) {
    await supabase.auth.signOut();
    return { error: MSG_SISTEMA };
  }
  if (!perfil?.activo) {
    await supabase.auth.signOut();
    return { error: MSG_SIN_ACCESO };
  }

  // Cada rol tiene su pantalla de inicio: el dashboard es solo del
  // superadministrador, así que mandar a todo el mundo ahí los rebotaría.
  redirect(rutaInicio(perfil.role));
}

/** Cierra la sesión actual. */
export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
