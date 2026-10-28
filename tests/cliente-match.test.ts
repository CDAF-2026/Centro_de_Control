import { describe, it, expect, vi } from "vitest";
import { buscarClienteDeReserva, leerBaseConocida, personaYaRegistrada } from "@/lib/clientes-match";

/**
 * Encontrar la ficha del cliente de una reserva de EasyCancha.
 *
 * El caso real (15-sep-2026): EasyCancha tenía a Karent Coronado como
 * `karentcoronadop@gmail.com` y su ficha del club como `karentcoronado@gmail.com`
 * — UNA LETRA. Buscando solo por correo no la encontró, creó una ficha nueva sin
 * paquetes, y su clase de paquete se cobró como particular a $150.000.
 * La cédula (1128424694) venía en la reserva y era la misma en las dos.
 */

/** Base de prueba: responde a `.ilike(email)` y a `.eq(documento)`. */
function baseCon(filas: { id: number; nombres: string; apellidos: string; email: string | null; documento: string | null }[]) {
  const llamadas: string[] = [];
  const supabase = {
    from: () => {
      let campo = "", valor = "";
      const q: Record<string, unknown> = {
        select: () => q,
        ilike: (c: string, v: string) => { campo = c; valor = v; llamadas.push(`ilike:${v}`); return q; },
        eq: (c: string, v: string) => { campo = c; valor = v; llamadas.push(`eq:${v}`); return q; },
        limit: () => q,
        maybeSingle: async () => {
          const f = filas.find((x) =>
            campo === "email"
              ? (x.email ?? "").toLowerCase() === valor.toLowerCase()
              : x.documento === valor);
          return { data: f ? { id: f.id, nombres: f.nombres, apellidos: f.apellidos } : null };
        },
      };
      return q;
    },
  };
  return { supabase: supabase as never, llamadas };
}

const KARENT_BUENA = { id: 554, nombres: "Karent", apellidos: "Coronado", email: "karentcoronado@gmail.com", documento: "1128424694" };

describe("buscarClienteDeReserva", () => {
  it("encuentra por correo cuando coincide", async () => {
    const { supabase } = baseCon([KARENT_BUENA]);
    const r = await buscarClienteDeReserva(supabase, { email: "karentcoronado@gmail.com", documento: "1128424694" });
    expect(r).toMatchObject({ id: 554, por: "correo" });
  });

  // EL CASO: el correo de EasyCancha trae una "p" de más.
  it("con el correo distinto, la encuentra por la CÉDULA", async () => {
    const { supabase } = baseCon([KARENT_BUENA]);
    const r = await buscarClienteDeReserva(supabase, { email: "karentcoronadop@gmail.com", documento: "1128424694" });
    expect(r).toMatchObject({ id: 554, por: "documento" });
  });

  it("el correo manda: si casa, ni mira la cédula", async () => {
    const { supabase, llamadas } = baseCon([KARENT_BUENA]);
    await buscarClienteDeReserva(supabase, { email: "karentcoronado@gmail.com", documento: "9999999" });
    expect(llamadas).toEqual(["ilike:karentcoronado@gmail.com"]);
  });

  it("la cédula casa aunque venga con puntos o guiones", async () => {
    const { supabase } = baseCon([KARENT_BUENA]);
    const r = await buscarClienteDeReserva(supabase, { email: "otro@gmail.com", documento: "1.128.424-694" });
    expect(r).toMatchObject({ id: 554, por: "documento" });
  });

  it("sin correo, la cédula sola basta", async () => {
    const { supabase } = baseCon([KARENT_BUENA]);
    const r = await buscarClienteDeReserva(supabase, { email: null, documento: "1128424694" });
    expect(r).toMatchObject({ id: 554, por: "documento" });
  });

  it("si no está por ninguno de los dos, devuelve null (y se creará la ficha)", async () => {
    const { supabase } = baseCon([KARENT_BUENA]);
    expect(await buscarClienteDeReserva(supabase, { email: "nadie@x.com", documento: "5555555" })).toBeNull();
  });

  it("sin correo ni cédula no busca nada", async () => {
    const { supabase, llamadas } = baseCon([KARENT_BUENA]);
    expect(await buscarClienteDeReserva(supabase, { email: "", documento: "" })).toBeNull();
    expect(llamadas).toEqual([]);
  });

  // Una cédula de 3 dígitos es basura, no un documento: no se busca con ella
  // para no emparejar a dos personas distintas.
  it("ignora una cédula demasiado corta", async () => {
    const { supabase, llamadas } = baseCon([KARENT_BUENA]);
    await buscarClienteDeReserva(supabase, { email: "", documento: "123" });
    expect(llamadas).toEqual([]);
  });
});

/**
 * La sincronización de clientes de EasyCancha no debe crear fichas repetidas.
 *
 * El caso real (7-oct-2026): creó la ficha 669 "Maximiliano Pimienta" aunque el niño ya
 * estaba en la 166 de su papá. La reserva traía el correo de la MAMÁ (acudiente de la 166)
 * y el documento del NIÑO (miembro de la 166): ninguno de los dos estaba en el titular,
 * que era lo único que se miraba.
 */
type Tablas = Record<string, Record<string, unknown>[]>;

/** Base de prueba: responde a `.select().order().range(desde, hasta)` por lotes, como PostgREST. */
function baseConTablas(tablas: Tablas, opciones: { errorEn?: string } = {}) {
  const pedidos: string[] = [];
  const supabase = {
    from: (tabla: string) => {
      const q = {
        select: () => q,
        order: () => q,
        range: async (desde: number, hasta: number) => {
          pedidos.push(`${tabla}:${desde}`);
          if (opciones.errorEn === tabla) return { data: null, error: { message: "sin permiso" } };
          return { data: (tablas[tabla] ?? []).slice(desde, hasta + 1), error: null };
        },
      };
      return q;
    },
  };
  return { supabase: supabase as never, pedidos };
}

const FICHA_PIMIENTA: Tablas = {
  clientes: [{ email: "ajpimientasandoval@hotmail.com", documento: "77194647", factura_a_nit: null }],
  cliente_facturacion_extra: [],
  cliente_miembros: [
    { cliente_id: 166, nombres: "Alex", apellidos: "Pimienta", documento: "77194647" },
    { cliente_id: 166, nombres: "Maximiliano", apellidos: "Pimienta Quimbayo", documento: "1019911784" },
  ],
  acudientes: [{ cliente_id: 166, email: "luiyiquimbayo@hotmail.com" }],
};

describe("personaYaRegistrada (sincronizar clientes de EasyCancha)", () => {
  it("EL CASO: el niño con el correo de la mamá y su propio documento ya tiene ficha", async () => {
    const base = await leerBaseConocida(baseConTablas(FICHA_PIMIENTA).supabase);
    const reserva = { email: "luiyiquimbayo@hotmail.com", documento: "1019911784", nombres: "Maximiliano", apellidos: "Pimienta" };
    expect(personaYaRegistrada(reserva, base)).toBe("documento");
  });

  it("sin documento en la reserva, lo reconoce por el correo de la mamá y el nombre del hijo", async () => {
    const base = await leerBaseConocida(baseConTablas(FICHA_PIMIENTA).supabase);
    const reserva = { email: "LuiyiQuimbayo@hotmail.com".toLowerCase(), documento: null, nombres: "MAXIMILIANO", apellidos: "Pimienta" };
    expect(personaYaRegistrada(reserva, base)).toBe("familia");
  });

  // Un adulto tiene ficha propia: si la mamá reserva a SU nombre, se le crea la suya, como antes.
  it("la mamá reservando a su nombre no casa con ningún hijo", async () => {
    const base = await leerBaseConocida(baseConTablas(FICHA_PIMIENTA).supabase);
    const reserva = { email: "luiyiquimbayo@hotmail.com", documento: null, nombres: "Luisa", apellidos: "Quimbayo" };
    expect(personaYaRegistrada(reserva, base)).toBeNull();
  });

  it("el correo de la ficha sigue mandando primero", async () => {
    const base = await leerBaseConocida(baseConTablas(FICHA_PIMIENTA).supabase);
    const reserva = { email: "ajpimientasandoval@hotmail.com", documento: "1019911784", nombres: "Alex", apellidos: "Pimienta" };
    expect(personaYaRegistrada(reserva, base)).toBe("correo");
  });

  it("alguien que no está por ningún lado es nuevo", async () => {
    const base = await leerBaseConocida(baseConTablas(FICHA_PIMIENTA).supabase);
    const reserva = { email: "nuevo@gmail.com", documento: "1234567", nombres: "Pedro", apellidos: "Pérez" };
    expect(personaYaRegistrada(reserva, base)).toBeNull();
  });

  // PostgREST corta en 1.000 filas sin avisar: con 1.500 miembros, el documento del 1.200 se perdía.
  it("lee las tablas completas por lotes de 1.000", async () => {
    const miembros = Array.from({ length: 1500 }, (_, i) => ({ cliente_id: i, nombres: "Niño", apellidos: `N${i}`, documento: String(5000000 + i) }));
    const { supabase, pedidos } = baseConTablas({ ...FICHA_PIMIENTA, cliente_miembros: miembros });
    const base = await leerBaseConocida(supabase);
    expect(base.documentos.has("5001200")).toBe(true);
    expect(pedidos.filter((p) => p.startsWith("cliente_miembros"))).toEqual(["cliente_miembros:0", "cliente_miembros:1000"]);
  });

  // Leer de menos aquí es crear fichas repetidas: un error no puede pasar como "no hay nadie".
  it("un error al leer se lanza en vez de seguir con la base incompleta", async () => {
    await expect(leerBaseConocida(baseConTablas(FICHA_PIMIENTA, { errorEn: "acudientes" }).supabase)).rejects.toThrow("sin permiso");
  });
});
