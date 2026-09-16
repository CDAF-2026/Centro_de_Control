import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Encontrar al cliente de una reserva de EasyCancha.
 *
 * Existe por el caso de **Karent Coronado** (15-sep-2026). EasyCancha tenía su
 * correo como `karentcoronadop@gmail.com` y su ficha del club como
 * `karentcoronado@gmail.com` — **una letra de diferencia**. Al registrar la
 * clase, la búsqueda (que solo miraba el correo) no la encontró, **creó una
 * ficha nueva** y esa ficha nueva no tenía paquetes: el modal dijo "este
 * cliente no tiene paquete activo" y solo quedó "Particular". Resultado: una
 * clase de paquete cobrada como particular a $150.000, y una Karent fantasma.
 *
 * **La cédula ya venía en la reserva** (`userFoidNumber: "1128424694"`, la misma
 * de su ficha buena): el dato para acertar estaba ahí y no se miraba.
 *
 * ⚠️ El correo va PRIMERO a propósito. Es lo que se usaba hasta ahora, así que
 * mirarlo antes deja intacto todo lo que ya funcionaba; la cédula solo entra
 * cuando el correo NO encuentra a nadie, que es exactamente el caso que fallaba.
 * Al revés se cambiaría el comportamiento de emparejamientos que hoy son
 * correctos, y esto decide a quién se le cobra.
 *
 * ⚠️ Se compara la cédula en CRUDO (solo dígitos, como la manda EasyCancha). Si
 * en la ficha quedó escrita con puntos, no casa — pero ahí no se pierde nada:
 * es el mismo resultado que antes de esta función.
 */
export type ClienteEncontrado = {
  id: number;
  nombres: string;
  apellidos: string;
  /** Por dónde se encontró; sirve para explicar y para medir. */
  por: "correo" | "documento";
};

export async function buscarClienteDeReserva(
  supabase: SupabaseClient,
  datos: { email?: string | null; documento?: string | null },
): Promise<ClienteEncontrado | null> {
  const em = (datos.email ?? "").trim().toLowerCase();
  if (em) {
    const { data } = await supabase
      .from("clientes")
      .select("id, nombres, apellidos")
      .ilike("email", em)
      .limit(1)
      .maybeSingle();
    if (data) return { ...data, por: "correo" };
  }

  const doc = (datos.documento ?? "").trim().replace(/\D/g, "");
  if (doc.length >= 5) {
    const { data } = await supabase
      .from("clientes")
      .select("id, nombres, apellidos")
      .eq("documento", doc)
      .limit(1)
      .maybeSingle();
    if (data) return { ...data, por: "documento" };
  }

  return null;
}
