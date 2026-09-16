import { describe, it, expect, vi } from "vitest";
import { buscarClienteDeReserva } from "@/lib/clientes-match";

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
