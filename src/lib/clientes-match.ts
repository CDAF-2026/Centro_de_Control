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
  /** Celular de cada ficha y de cada acudiente → clave de nombre de cada miembro de su ficha. */
  familiasPorCelular: Map<string, Set<string>>;
};

/** "Maximiliano José" + "Pimienta Quimbayo" → "maximiliano pimienta" (primer nombre y primer apellido). */
function claveNombre(nombres: string | null | undefined, apellidos: string | null | undefined): string | null {
  const n = normalizarNombre(nombres).split(" ")[0];
  const a = normalizarNombre(apellidos).split(" ")[0];
  return n && a ? `${n} ${a}` : null;
}

/** Últimos 10 dígitos: "+57 320 788 0342" = "3207880342". Menos de 10 no es un celular. */
function claveCelular(celular: string | null | undefined): string | null {
  const d = (celular ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : null;
}

/**
 * ¿La persona de esta reserva ya tiene ficha? En este orden: el correo de una ficha,
 * su documento (de titular o de miembro), o el correo o el CELULAR de la familia con el
 * nombre de alguien de esa ficha. Si la mamá reserva a SU nombre, no casa con ningún
 * miembro y se le crea su ficha, como hasta ahora: un adulto tiene ficha propia.
 *
 * El celular, por Maximiliano Velásquez (28-oct-2026): reserva con su propia cuenta
 * (maximilianov@…), sin documento, y lo único que coincide es el celular del papá. Por
 * eso la sincronización le creó una ficha repetida dos veces (16-sep y 7-oct).
 */
export function personaYaRegistrada(
  persona: { email: string; documento: string | null; nombres: string | null; apellidos: string | null; celular?: string | null },
  base: BaseConocida,
): "correo" | "documento" | "familia" | null {
  if (base.correos.has(persona.email)) return "correo";
  if (persona.documento && base.documentos.has(persona.documento)) return "documento";
  const clave = claveNombre(persona.nombres, persona.apellidos);
  if (!clave) return null;
  if (base.familias.get(persona.email)?.has(clave)) return "familia";
  const cel = claveCelular(persona.celular);
  if (cel && base.familiasPorCelular.get(cel)?.has(clave)) return "familia";
  return null;
}

/** Nombre + celular de una persona que la sincronización ya va a crear en esta corrida. */
export function claveColaSync(nombres: string | null, apellidos: string | null, celular: string | null): string | null {
  const nombre = claveNombre(nombres, apellidos);
  const cel = claveCelular(celular);
  return nombre && cel ? `${cel} ${nombre}` : null;
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
    leerTodo<{ id: number; email: string | null; documento: string | null; factura_a_nit: string | null; celular: string | null }>((d, h) =>
      supabase.from("clientes").select("id, email, documento, factura_a_nit, celular").order("id").range(d, h)),
    leerTodo<{ nit: string | null }>((d, h) => supabase.from("cliente_facturacion_extra").select("nit").order("id").range(d, h)),
    leerTodo<{ cliente_id: number; nombres: string; apellidos: string; documento: string | null }>((d, h) =>
      supabase.from("cliente_miembros").select("cliente_id, nombres, apellidos, documento").order("id").range(d, h)),
    leerTodo<{ cliente_id: number | null; email: string | null; telefono: string | null }>((d, h) =>
      supabase.from("acudientes").select("cliente_id, email, telefono").order("id").range(d, h)),
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
  const agregar = (mapa: Map<string, Set<string>>, llave: string | null, clienteId: number | null) => {
    const nombres = clienteId != null ? nombresPorFicha.get(clienteId) : undefined;
    if (!llave || !nombres) return;
    if (!mapa.has(llave)) mapa.set(llave, new Set());
    for (const n of nombres) mapa.get(llave)!.add(n);
  };
  const familias = new Map<string, Set<string>>();
  const familiasPorCelular = new Map<string, Set<string>>();
  for (const a of acudientes) {
    agregar(familias, limpio(a.email).toLowerCase() || null, a.cliente_id);
    agregar(familiasPorCelular, claveCelular(a.telefono), a.cliente_id);
  }
  for (const c of fichas) agregar(familiasPorCelular, claveCelular(c.celular), c.id);
  return { correos, documentos, familias, familiasPorCelular };
}
