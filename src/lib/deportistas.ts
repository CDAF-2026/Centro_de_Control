import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Lo mínimo que hay que leer de una clase para saber de quién es. */
export type ClaseConDeportista = {
  cliente_id: number | null;
  miembro_id?: number | null;
};

/**
 * Nombre del deportista de cada clase, leído SIEMPRE de `cliente_miembros`.
 *
 * ⚠️ **Nunca leer `public.clientes` para pintar el nombre de una clase.** El
 * profesor no tiene el módulo de clientes (matriz de permisos, 31-jul-2026) y
 * la política `clientes_select` lo excluye, así que a él esa consulta le
 * devuelve CERO filas — sin error, solo vacío — y el calendario y la cola de
 * cierre le salían con "—" en todas las clases particulares. Verificado
 * simulando su sesión: ve 0 de 320 en `clientes` y 276 en `cliente_miembros`.
 * `cliente_miembros_select` sí lo incluye (0033), justo porque el roster de
 * cierre depende de ella. Mismo patrón que `staff.ts` con `profiles`.
 *
 * Y de paso queda bien el caso de los hermanos: si la clase fija `miembro_id`
 * se muestra al hermano que la tomó, no al titular de la ficha familiar.
 */
export async function nombresDeportistas(
  supabase: Supabase,
  clases: ClaseConDeportista[],
): Promise<(clase: ClaseConDeportista) => string | null> {
  const miembroIds = [...new Set(clases.map((c) => c.miembro_id).filter((x): x is number => x != null))];
  const clienteIds = [...new Set(clases.map((c) => c.cliente_id).filter((x): x is number => x != null))];

  const porMiembro = new Map<number, string>();
  const porFicha = new Map<number, string>();

  if (miembroIds.length) {
    const { data } = await supabase
      .from("cliente_miembros")
      .select("id, nombres, apellidos")
      .in("id", miembroIds);
    for (const m of data ?? []) porMiembro.set(m.id, `${m.nombres} ${m.apellidos}`.trim());
  }
  if (clienteIds.length) {
    const { data } = await supabase
      .from("cliente_miembros")
      .select("cliente_id, nombres, apellidos")
      .in("cliente_id", clienteIds)
      .eq("es_titular", true);
    for (const m of data ?? []) porFicha.set(m.cliente_id, `${m.nombres} ${m.apellidos}`.trim());
  }

  // Respaldo al titular: la mayoría de las clases no fija miembro (17 de 18 hoy).
  return (clase) =>
    (clase.miembro_id != null ? porMiembro.get(clase.miembro_id) : null) ??
    (clase.cliente_id != null ? porFicha.get(clase.cliente_id) : null) ??
    null;
}
