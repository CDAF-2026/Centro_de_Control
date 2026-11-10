import { describe, it, expect } from "vitest";
import { instanteClase } from "../src/lib/fecha";

/**
 * Prueba de regresión del bug del 31-jul-2026.
 *
 * `/cierre` salía SIEMPRE vacía y los dos candados del cierre nunca bloqueaban,
 * porque el cálculo escrito a mano armaba `"2026-07-31T15:00:00:00"` (cuatro
 * grupos) al pegarle `:00` a una hora que PostgREST ya entrega con segundos.
 * Eso da Invalid Date -> NaN, y toda comparación con NaN es `false`.
 *
 * Estas pruebas fijan las dos cosas que se rompieron: que el instante sea VÁLIDO
 * con el formato real de la base, y que se interprete en hora de Colombia y no
 * en la del servidor (Vercel corre en UTC).
 */
describe("instanteClase", () => {
  it("acepta el formato que devuelve PostgREST (HH:MM:SS) y NO da NaN", () => {
    const t = instanteClase("2026-07-31", "15:00:00");
    expect(Number.isNaN(t)).toBe(false);
    // 15:00 en Colombia (UTC-5) es 20:00 UTC.
    expect(new Date(t).toISOString()).toBe("2026-07-31T20:00:00.000Z");
  });

  it("también acepta HH:MM, por si algún día cambia la serialización", () => {
    expect(instanteClase("2026-07-31", "15:00")).toBe(instanteClase("2026-07-31", "15:00:00"));
  });

  it("interpreta la hora en Colombia aunque el servidor corra en UTC", () => {
    const tzOriginal = process.env.TZ;
    try {
      process.env.TZ = "UTC";
      const enUtc = instanteClase("2026-07-31", "15:00:00");
      process.env.TZ = "America/Bogota";
      const enBogota = instanteClase("2026-07-31", "15:00:00");
      // El instante es el mismo pase lo que pase con el reloj del servidor.
      expect(enUtc).toBe(enBogota);
    } finally {
      process.env.TZ = tzOriginal;
    }
  });

  it("sin hora, el piso es el arranque del día y el techo el final", () => {
    const piso = instanteClase("2026-07-31", null, "00:00:00");
    const techo = instanteClase("2026-07-31", null, "23:59:00");
    expect(new Date(piso).toISOString()).toBe("2026-07-31T05:00:00.000Z");
    expect(techo).toBeGreaterThan(piso);
  });

  it("una clase que ya empezó queda en el pasado y una futura en el futuro", () => {
    const ahora = Date.now();
    const hace2h = new Date(ahora - 2 * 3600_000);
    const en2h = new Date(ahora + 2 * 3600_000);
    const iso = (d: Date) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Bogota",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
      })
        .formatToParts(d)
        .reduce((a, p) => ({ ...a, [p.type]: p.value }), {} as Record<string, string>);

    const p = iso(hace2h);
    const f = iso(en2h);
    expect(instanteClase(`${p.year}-${p.month}-${p.day}`, `${p.hour}:${p.minute}:${p.second}`))
      .toBeLessThanOrEqual(ahora);
    expect(instanteClase(`${f.year}-${f.month}-${f.day}`, `${f.hour}:${f.minute}:${f.second}`))
      .toBeGreaterThan(ahora);
  });
});

/**
 * El plazo para cerrar una clase: 48 h desde que EMPIEZA (eran 24 hasta el
 * 10-nov-2026; el club lo pidió porque a los profesores se les quedaba corto).
 *
 * Se prueba aquí, sin base, porque el plazo vive en un solo sitio
 * (`PLAZO_CIERRE_HORAS`) y todas las pantallas y acciones pasan por
 * `venceCierre` / `cierreVencido`.
 */
describe("el plazo para cerrar una clase", () => {
  const H = 3_600_000;

  it("son 48 horas: lo pidió el club, no es un número suelto", async () => {
    const { PLAZO_CIERRE_HORAS } = await import("../src/lib/fecha");
    expect(PLAZO_CIERRE_HORAS).toBe(48);
  });

  it("se cuenta desde la hora de INICIO de la clase, en hora de Colombia", async () => {
    const { venceCierre } = await import("../src/lib/fecha");
    // Clase del jueves 30-jul a las 10:00 a. m. de Bogotá = 15:00 UTC.
    expect(new Date(venceCierre("2026-07-30", "10:00:00")).toISOString()).toBe(
      "2026-08-01T15:00:00.000Z",
    );
  });

  it("a las 30 h todavía se puede cerrar (con el plazo viejo de 24 ya no)", async () => {
    const { cierreVencido, instanteClase } = await import("../src/lib/fecha");
    const inicio = instanteClase("2026-07-30", "10:00:00");
    expect(cierreVencido("2026-07-30", "10:00:00", inicio + 30 * H)).toBe(false);
    expect(cierreVencido("2026-07-30", "10:00:00", inicio + 48 * H - 60_000)).toBe(false);
  });

  it("pasadas las 48 h queda vencida", async () => {
    const { cierreVencido, instanteClase } = await import("../src/lib/fecha");
    const inicio = instanteClase("2026-07-30", "10:00:00");
    expect(cierreVencido("2026-07-30", "10:00:00", inicio + 48 * H + 60_000)).toBe(true);
    expect(cierreVencido("2026-07-30", "10:00:00", inicio + 72 * H)).toBe(true);
  });

  it("una clase sin hora cuenta desde el final de su día", async () => {
    const { venceCierre, instanteClase } = await import("../src/lib/fecha");
    expect(venceCierre("2026-07-30", null)).toBe(
      instanteClase("2026-07-30", null, "23:59:00") + 48 * H,
    );
  });
});
