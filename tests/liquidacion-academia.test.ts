import { describe, it, expect, vi } from "vitest";
import { createClient as sbClient } from "@supabase/supabase-js";

/**
 * Reglas de academia ATADAS A UNA ACADEMIA (24-sep-2026, dictado por Laura):
 *   · Leo: $90.000 por clase de Recreativa Pádel; su clase de Competencia NO
 *     cobra los $90.000 — se paga con el 50% de lo facturado en Siigo.
 *   · Juan: $70.000 por clase de Recreativa Pádel y $70.000 por Montessori.
 *   · Victor: $60.000 por clase de academia (regla sin academia = todas).
 *
 * La academia de la clase la congela `clase_abrir_del_planeador`; aquí se
 * siembran clases con `academia_id` ya puesto en una semana de 2027 (sin datos
 * reales) y se borran al final.
 */

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => admin() }));
const admin = () =>
  sbClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

async function perfil(nombre: string) {
  const { data } = await admin().from("profiles").select("id").eq("nombre", nombre).single();
  return data!.id as string;
}

describe("liquidación de academia por academia", () => {
  it("paga cada clase con la regla de su academia", async () => {
    const [leo, juan, victor] = await Promise.all([perfil("Leo Ruíz"), perfil("Juan Cruz"), perfil("Victor Acosta")]);
    const base = { tipo: "academia", deporte: "padel", precio: 0, estado: "realizada", hora_fin: "18:00:00" };
    const { data: cs, error } = await admin()
      .from("clases")
      .insert([
        { ...base, profesor_id: leo, academia_id: 28, fecha: "2027-03-01", hora_inicio: "16:00:00" }, // recreativa
        { ...base, profesor_id: leo, academia_id: 29, fecha: "2027-03-01", hora_inicio: "17:00:00" }, // competencia
        { ...base, profesor_id: juan, academia_id: 28, fecha: "2027-03-01", hora_inicio: "16:00:00" }, // recreativa
        { ...base, profesor_id: juan, academia_id: null, fecha: "2027-03-02", hora_inicio: "15:00:00" }, // Montessori
        { ...base, profesor_id: victor, academia_id: 28, fecha: "2027-03-02", hora_inicio: "17:00:00" },
      ])
      .select("id");
    expect(error).toBeNull();
    const ids = (cs ?? []).map((c) => c.id);
    try {
      const { calcularLiquidacion } = await import("../src/lib/liquidacion");
      const liq = await calcularLiquidacion("2027-03-01", "2027-03-07", 1);
      const linea = (id: number) => liq.flatMap((p) => p.lineas).find((l) => l.claseId === id)!;
      const [leoRec, leoComp, juanRec, juanMont, vic] = ids.map(linea);

      expect(leoRec.valorProfesor).toBe(90000);
      expect(leoComp.valorProfesor).toBe(0);
      expect(leoComp.tipoLabel).toMatch(/competencia/i); // $0 CON nombre, no por falta de regla
      expect(juanRec.valorProfesor).toBe(70000);
      expect(juanMont.valorProfesor).toBe(70000);
      expect(juanMont.tipoLabel).toMatch(/montessori/i);
      expect(vic.valorProfesor).toBe(60000);
    } finally {
      await admin().from("clases").delete().in("id", ids);
    }
  }, 30000);

  it("las clases de colegio de TENIS se pagan con la regla de academia de cada profesor", async () => {
    // Laura (24-sep-2026): Monte Luna y Montessori de tenis NO se pagan como el
    // Montessori de pádel de Juan; cada profesor cobra según su propia regla de
    // academia (Jorge, Cristian y Graciano: cubierta por su salario).
    const [jorge, seb] = await Promise.all([perfil("Jorge Pérez"), perfil("Sebastian Niño Mora")]);
    const base = { tipo: "academia", deporte: "tenis", precio: 0, estado: "realizada", hora_fin: "16:00:00" };
    const { data: cs } = await admin()
      .from("clases")
      .insert([
        { ...base, profesor_id: jorge, academia_id: null, fecha: "2027-03-02", hora_inicio: "14:30:00" },
        { ...base, profesor_id: seb, academia_id: 27, fecha: "2027-03-03", hora_inicio: "14:30:00" },
      ])
      .select("id");
    const ids = (cs ?? []).map((c) => c.id);
    try {
      const { calcularLiquidacion } = await import("../src/lib/liquidacion");
      const liq = await calcularLiquidacion("2027-03-01", "2027-03-07", 1);
      const linea = (id: number) => liq.flatMap((p) => p.lineas).find((l) => l.claseId === id)!;
      const [colegioJorge, acaSeb] = ids.map(linea);
      expect(colegioJorge.valorProfesor).toBe(0);
      expect(colegioJorge.tipoLabel).toMatch(/cubierta por salario/i);
      // Sebastián: la academia va dentro de su salario (regla con nombre, no "sin regla").
      expect(acaSeb.valorProfesor).toBe(0);
      expect(acaSeb.tipoLabel).toMatch(/cubierta por salario/i);
    } finally {
      await admin().from("clases").delete().in("id", ids);
    }
  }, 30000);
});
