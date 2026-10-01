import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { rangoPeriodo, hoyBogota, isoDia } from "../src/lib/periodo";

/**
 * Prueba de regresión del bug del 30-sep-2026.
 *
 * El cliente entró al dashboard a las 8 p. m. del 30 de septiembre y todo salía
 * en $0: el servidor (Vercel, en UTC) ya estaba en el 1 de octubre y "este mes"
 * quedaba en "1–1 de octubre". Se simula un servidor en UTC.
 */
describe("periodo en hora de Colombia con el servidor en UTC", () => {
  let tzOriginal: string | undefined;
  beforeAll(() => {
    tzOriginal = process.env.TZ;
    process.env.TZ = "UTC";
  });
  afterAll(() => {
    process.env.TZ = tzOriginal;
  });

  it("a las 8 p. m. del 30-sep el mes sigue siendo septiembre", () => {
    const r = rangoPeriodo("mes", new Date("2026-09-30T20:00:00-05:00"));
    expect(r).toEqual({
      curStartIso: "2026-09-01",
      curEndIso: "2026-09-30",
      todayIso: "2026-09-30",
      prevStartIso: "2026-08-01",
      prevEndIso: "2026-08-30",
    });
  });

  it("a las 11:59 p. m. todavía es el mismo día; a las 12:00 a. m. cambia", () => {
    expect(isoDia(hoyBogota(new Date("2026-09-30T23:59:00-05:00")))).toBe("2026-09-30");
    expect(isoDia(hoyBogota(new Date("2026-10-01T00:00:00-05:00")))).toBe("2026-10-01");
  });

  it("la semana de 7 días termina hoy en Colombia, no mañana", () => {
    const r = rangoPeriodo("semana", new Date("2026-09-30T19:30:00-05:00"));
    expect(r.curStartIso).toBe("2026-09-24");
    expect(r.curEndIso).toBe("2026-09-30");
  });
});
