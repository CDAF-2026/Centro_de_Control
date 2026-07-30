/**
 * Foto de perfil del staff.
 *
 * En `profiles.avatar_path` se guarda la RUTA dentro del bucket `avatares`
 * (p. ej. `a1b2…/1754000000-foto.jpg`), no la URL: así el enlace se arma aquí
 * y no queda una URL vieja pegada en la base si algún día cambia el bucket.
 * El bucket es público (ver migración 0060), por eso basta con concatenar.
 */
export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatares/${path}`;
}

/** Iniciales para el círculo cuando la persona todavía no tiene foto. */
export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  const ini = (partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "");
  return ini.toUpperCase() || "U";
}
