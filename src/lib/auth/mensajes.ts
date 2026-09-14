/**
 * Traduce un fallo de Supabase Auth al mensaje que ve la persona.
 *
 * Existe porque el login respondía "Correo o contraseña incorrectos" ante
 * CUALQUIER error, incluido "la base de datos no responde". El 14-sep-2026
 * Supabase pausó el proyecto por facturas sin pagar y la pantalla acusó a Laura
 * de escribir mal la clave: estuvo cambiándola y reintentando mientras el
 * problema estaba en otro lado. Un fallo del sistema y una clave mala se
 * arreglan de formas distintas, así que no pueden verse igual.
 */

export const MSG_CREDENCIALES = "Correo o contraseña incorrectos.";
export const MSG_SIN_ACCESO = "Esta cuenta ya no tiene acceso. Habla con el administrador.";
export const MSG_DEMASIADOS = "Demasiados intentos. Espera un momento y vuelve a intentar.";
export const MSG_SISTEMA =
  "No pudimos conectarnos con el sistema. No es tu contraseña: intenta de nuevo en unos minutos y, si sigue igual, avísale al administrador.";

/** Lo que interesa del `AuthError` de Supabase. Sin `status` = nunca hubo respuesta. */
export type FalloAuth = { status?: number; code?: string } | null | undefined;

export function mensajeLogin(error: FalloAuth): string {
  if (!error) return MSG_SISTEMA;
  // Dar de baja a un empleado lo banea en Auth (`cambiarAccesoEmpleado`), y el
  // baneo se rechaza ANTES de mirar el perfil: sin esto, al despedido le decía
  // que su clave estaba mal.
  if (error.code === "user_banned") return MSG_SIN_ACCESO;
  // Sin `status` no hubo respuesta (red caída, proyecto pausado); 5xx es el
  // servicio contestando que está roto. Ninguno de los dos habla de la clave.
  if (error.status === undefined || error.status >= 500) return MSG_SISTEMA;
  if (error.status === 429) return MSG_DEMASIADOS;
  return MSG_CREDENCIALES;
}
