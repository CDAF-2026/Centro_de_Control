"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Cada cuánto se vuelve a pedir la lista. Corto: es la pantalla que la cafetería deja abierta. */
export const SEGUNDOS_ENTRE_REFRESCOS = 30;

/**
 * Mantiene la pantalla de pedidos al día sin que nadie recargue:
 *   · los pedidos nuevos aparecen solos;
 *   · al cambiar el día, la lista por atender queda vacía sola ("hoy" lo calcula
 *     el servidor en cada refresco; aquí solo se vuelve a preguntar);
 *   · el aviso de "quedó como Entregado" se quita de la dirección apenas se
 *     muestra, para que el siguiente refresco no lo repita. Ese refresco es el
 *     que lo borra de la pantalla, así que el reloj vuelve a empezar con cada
 *     aviso (`aviso` cambia): si no, el "Deshacer" podía durar un segundo.
 * No pinta nada.
 */
export function AlDia({ aviso }: { aviso: string | null }) {
  const limpiarAviso = aviso !== null;
  const router = useRouter();

  useEffect(() => {
    if (!limpiarAviso) return;
    const url = new URL(window.location.href);
    for (const clave of ["hecho", "antes", "error"]) url.searchParams.delete(clave);
    window.history.replaceState(null, "", url);
  }, [limpiarAviso, aviso]);

  useEffect(() => {
    // Con la pestaña escondida no se gasta nada; al volver a ella se refresca de una.
    const refrescar = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const reloj = setInterval(refrescar, SEGUNDOS_ENTRE_REFRESCOS * 1000);
    document.addEventListener("visibilitychange", refrescar);
    return () => {
      clearInterval(reloj);
      document.removeEventListener("visibilitychange", refrescar);
    };
  }, [router, aviso]);

  return null;
}
