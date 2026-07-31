import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { rutaInicio } from "@/lib/auth/permissions";

/**
 * La raíz no pinta nada: manda a donde toca.
 *
 * Antes había una portada con el nombre del club y un botón "Ingresar". Era un
 * clic de más para llegar al mismo formulario: esto es una herramienta interna,
 * no un sitio de mercadeo — quien entra ya sabe a qué viene (decisión de Laura,
 * 31-jul-2026, tras el primer despliegue). El logo y la marca ya están en la
 * propia pantalla de login, así que no se pierde nada visualmente.
 *
 * Se resuelve el destino AQUÍ en vez de redirigir siempre a `/login` para que
 * sea un solo salto: `/login` a su vez rebota a `rutaInicio()` a quien ya tiene
 * sesión, así que un redirect fijo haría rebotar dos veces al caso más común
 * (alguien del staff que guardó el dominio pelado en favoritos).
 */
export default async function Home() {
  const sesion = await getProfile();
  redirect(sesion?.activo ? rutaInicio(sesion.role) : "/login");
}
