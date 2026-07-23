/**
 * Búsqueda de personas por texto libre. Módulo plano (sin "use client"/"use server")
 * para que lo usen igual la lista (servidor), el autocompletar (server action) y la
 * exportación.
 *
 * El problema que resuelve: nombres y apellidos son columnas separadas, así que buscar
 * la frase entera "Juan Trelles" en una sola columna no encuentra a nadie. Aquí se parte
 * el texto en palabras y se arma una cláusula OR por palabra; al aplicarlas por separado
 * sobre el query, PostgREST las une con AND. Resultado: "Juan Trelles" exige que AMBAS
 * palabras aparezcan (una en nombres, otra en apellidos), y "Trelles Juan" también sirve.
 */

export type CampoBusqueda = "nombres" | "apellidos" | "documento";

/**
 * Devuelve una cláusula `.or()` por cada palabra del texto. Aplicarlas todas
 * (una llamada `.or()` por elemento) equivale a exigirlas con AND.
 *
 * Ejemplo: `clausulasBusqueda("juan trelles")` →
 *   ["nombres.ilike.%juan%,apellidos.ilike.%juan%,documento.ilike.%juan%",
 *    "nombres.ilike.%trelles%,apellidos.ilike.%trelles%,documento.ilike.%trelles%"]
 */
export function clausulasBusqueda(
  texto: string,
  campos: CampoBusqueda[] = ["nombres", "apellidos", "documento"],
): string[] {
  return texto
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((palabra) => campos.map((c) => `${c}.ilike.%${palabra}%`).join(","));
}
