import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizarNombre } from "@/lib/registro/match";

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

/**
 * Lo que la base ya conoce, para que la sincronización de clientes de EasyCancha
 * no cree fichas repetidas.
 *
 * Caso real (7-oct-2026): la sincronización creó la ficha 669 "Maximiliano Pimienta"
 * aunque el niño ya estaba en la 166, la de su papá. La reserva traía el correo de la
 * MAMÁ y el documento del NIÑO, y solo se comparaba con el titular de cada ficha: el
 * correo de la mamá está en `acudientes` y el documento del niño en `cliente_miembros`.
 * Ese mismo día salieron igual las fichas repetidas de Laura Restrepo y Maximiliano
 * Velásquez. El 26-oct al niño lo matricularon en la ficha repetida y su firma quedó
 * en la otra.
 */
export type BaseConocida = {
  /** Correo de cada ficha (titular). */
  correos: Set<string>;
  /** Documento y NIT de facturación de cada ficha, NIT adicionales y documento de cada miembro. */
  documentos: Set<string>;
  /** Correo de cada acudiente → clave de nombre de cada miembro de su ficha. */
  familias: Map<string, Set<string>>;
};

/** "Maximiliano José" + "Pimienta Quimbayo" → "maximiliano pimienta" (primer nombre y primer apellido). */
function claveNombre(nombres: string | null | undefined, apellidos: string | null | undefined): string | null {
  const n = normalizarNombre(nombres).split(" ")[0];
  const a = normalizarNombre(apellidos).split(" ")[0];
  return n && a ? `${n} ${a}` : null;
}

/**
 * ¿La persona de esta reserva ya tiene ficha? En este orden: el correo de una ficha,
 * su documento (de titular o de miembro), o el correo de un acudiente con el nombre de
 * un hijo de esa familia. Si la mamá reserva a SU nombre con su correo, no casa con
 * ningún hijo y se le crea su ficha, como hasta ahora: un adulto tiene ficha propia.
 */
export function personaYaRegistrada(
  persona: { email: string; documento: string | null; nombres: string | null; apellidos: string | null },
  base: BaseConocida,
): "correo" | "documento" | "familia" | null {
  if (base.correos.has(persona.email)) return "correo";
  if (persona.documento && base.documentos.has(persona.documento)) return "documento";
  const clave = claveNombre(persona.nombres, persona.apellidos);
  if (clave && base.familias.get(persona.email)?.has(clave)) return "familia";
  return null;
}

/** PostgREST corta en 1.000 filas sin avisar: se lee por lotes. Un error de lectura se lanza
 *  (leer de menos aquí es crear fichas repetidas). */
async function leerTodo<T>(pedir: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const LOTE = 1000;
  const filas: T[] = [];
  for (let desde = 0; ; desde += LOTE) {
    const { data, error } = await pedir(desde, desde + LOTE - 1);
    if (error) throw new Error(error.message);
    filas.push(...(data ?? []));
    if ((data ?? []).length < LOTE) return filas;
  }
}

export async function leerBaseConocida(supabase: SupabaseClient): Promise<BaseConocida> {
  const [fichas, extra, miembros, acudientes] = await Promise.all([
    leerTodo<{ email: string | null; documento: string | null; factura_a_nit: string | null }>((d, h) =>
      supabase.from("clientes").select("email, documento, factura_a_nit").order("id").range(d, h)),
    leerTodo<{ nit: string | null }>((d, h) => supabase.from("cliente_facturacion_extra").select("nit").order("id").range(d, h)),
    leerTodo<{ cliente_id: number; nombres: string; apellidos: string; documento: string | null }>((d, h) =>
      supabase.from("cliente_miembros").select("cliente_id, nombres, apellidos, documento").order("id").range(d, h)),
    leerTodo<{ cliente_id: number | null; email: string | null }>((d, h) =>
      supabase.from("acudientes").select("cliente_id, email").order("id").range(d, h)),
  ]);

  const limpio = (v: string | null | undefined) => (v ?? "").trim();
  const correos = new Set(fichas.map((c) => limpio(c.email).toLowerCase()).filter(Boolean));
  const documentos = new Set(
    [...fichas.flatMap((c) => [c.documento, c.factura_a_nit]), ...extra.map((e) => e.nit), ...miembros.map((m) => m.documento)]
      .map(limpio)
      .filter(Boolean),
  );

  const nombresPorFicha = new Map<number, Set<string>>();
  for (const m of miembros) {
    const clave = claveNombre(m.nombres, m.apellidos);
    if (!clave) continue;
    if (!nombresPorFicha.has(m.cliente_id)) nombresPorFicha.set(m.cliente_id, new Set());
    nombresPorFicha.get(m.cliente_id)!.add(clave);
  }
  const familias = new Map<string, Set<string>>();
  for (const a of acudientes) {
    const correo = limpio(a.email).toLowerCase();
    const nombres = a.cliente_id != null ? nombresPorFicha.get(a.cliente_id) : undefined;
    if (!correo || !nombres) continue;
    if (!familias.has(correo)) familias.set(correo, new Set());
    for (const n of nombres) familias.get(correo)!.add(n);
  }
  return { correos, documentos, familias };
}
