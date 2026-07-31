import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { rutaInicio } from "@/lib/auth/permissions";
import type { AppRole } from "@/lib/database.types";

export type Profile = {
  id: string;
  role: AppRole;
  nombre: string | null;
  telefono: string | null;
  avatar_path: string | null;
  activo: boolean;
};

/** Usuario autenticado (o null). Valida el token contra Supabase. */
export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Perfil del usuario actual (rol + datos), o null si no hay sesión. */
export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, role, nombre, telefono, avatar_path, activo")
    .eq("id", user.id)
    .single();

  return data ?? null;
}

/** Exige sesión; si no hay, redirige a /login. */
export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Exige sesión + perfil; si no, redirige a /login.
 *
 * También es el portero de las cuentas dadas de baja: `activo = false` antes
 * solo escondía a la persona de las listas desplegables, pero seguía entrando
 * con su clave de siempre. Aquí se le cierra la sesión y se le devuelve al
 * login. El chequeo va en esta función porque `(app)/layout.tsx` la llama en
 * cada pantalla del sistema, así que cubre todo de una vez.
 */
export async function requireProfile(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!profile.activo) {
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login?bloqueado=1");
  }
  return profile;
}

/**
 * Exige uno de los roles indicados; si no, lo devuelve a su pantalla de inicio.
 *
 * Es `rutaInicio(role)` y no `/dashboard` fijo: el dashboard ya no lo ve todo el
 * mundo, así que mandar ahí a un profesor lo dejaría rebotando entre dos
 * pantallas prohibidas.
 */
export async function requireRole(roles: AppRole[]): Promise<Profile> {
  const profile = await requireProfile();
  if (!roles.includes(profile.role)) redirect(rutaInicio(profile.role));
  return profile;
}
