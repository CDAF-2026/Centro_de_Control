/**
 * Los profesores importados de EasyCancha NO tienen correo real (EasyCancha no lo expone),
 * así que su cuenta usa un correo placeholder técnico `vena.digital.2207+profe.<slug>@gmail.com`
 * SOLO para poder iniciar sesión. Ese correo NO debe mostrarse: en la app se ve vacío hasta
 * que se les asigne uno real. El correo del superadministrador (sin "+") sí es real y se muestra.
 */
const PLACEHOLDER = /vena\.digital\.2207\+/i;

/** Devuelve el correo si es real; cadena vacía si es un placeholder técnico generado. */
export function correoVisible(email: string | null | undefined): string {
  const e = (email ?? "").trim();
  return PLACEHOLDER.test(e) ? "" : e;
}
