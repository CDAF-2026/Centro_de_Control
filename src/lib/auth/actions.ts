"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
  if (error) {
    return { error: "Correo o contraseña incorrectos." };
  }

  // La clave era correcta, pero la cuenta puede estar dada de baja. Se corta
  // aquí para dar un mensaje claro; si no, `requireProfile` lo devolvería al
  // login sin explicar por qué y parecería un error del sistema.
  const { data: perfil } = await supabase
    .from("profiles")
    .select("activo")
    .eq("id", data.user.id)
    .single();
  if (!perfil?.activo) {
    await supabase.auth.signOut();
    return { error: "Esta cuenta ya no tiene acceso. Habla con el administrador." };
  }

  redirect("/dashboard");
}

/** Cierra la sesión actual. */
export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
