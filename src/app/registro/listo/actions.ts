"use server";

import { redirect } from "next/navigation";
import { cerrarSesion } from "@/lib/registro/sesion";

/** "No, gracias": cierra la sesión del recorrido y borra la cookie. */
export async function terminarRecorrido(): Promise<void> {
  await cerrarSesion();
  redirect("/registro");
}
