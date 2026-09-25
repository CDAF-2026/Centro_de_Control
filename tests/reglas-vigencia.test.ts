import { describe, it, expect, vi } from "vitest";
import { createClient as sbClient } from "@supabase/supabase-js";
import { planGuardarReglas, vigenteEl, diaAnterior, type ReglaGuardada, type ReglaDatos } from "../src/lib/reglas-vigencia";

/**
 * Vigencia de las reglas de pago (24-sep-2026). Cambiar una regla ya no reescribe los
 * meses anteriores: la vieja se cierra el último día del mes anterior y la nueva paga desde
 * el día 1 del mes elegido.
 */

vi.mock("@/lib/auth", () => ({
  requireRole: async () => ({ id: "", role: "superadmin", nombre: "test", activo: true }),
  requireProfile: async () => ({ id: "", role: "superadmin", nombre: "test", activo: true }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => admin(), createAdminClient: async () => admin() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {}, refresh: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (u: string) => { throw new Error("REDIRECT " + u); }, notFound: () => { throw new Error("NOT_FOUND"); } }));

const admin = () =>
  sbClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

const base: ReglaDatos = {
  nombre: "Clases particulares", concepto: "clase_particular", metodo: "fijo_por_clase", pct: 0, valor: 90000,
  servicio_id: null, escalones: null, dias: null, hora_desde: null, hora_hasta: null, umbral: null,
};
const guardada = (id: number, orden: number, datos: Partial<ReglaDatos> = {}, vig: Partial<ReglaGuardada> = {}): ReglaGuardada => ({
  ...base, ...datos, id, orden, activo: true, vigente_desde: "2026-06-01", vigente_hasta: null, ...vig,
});

describe("vigencia: lógica pura", () => {
  it("una regla paga dentro de su rango, con los dos bordes incluidos", () => {
    const r = { vigente_desde: "2026-10-01", vigente_hasta: "2026-10-31" };
    expect(vigenteEl(r, "2026-09-30")).toBe(false);
    expect(vigenteEl(r, "2026-10-01")).toBe(true);
    expect(vigenteEl(r, "2026-10-31")).toBe(true);
    expect(vigenteEl(r, "2026-11-01")).toBe(false);
    expect(vigenteEl({ vigente_desde: "2026-06-01", vigente_hasta: null }, "2030-01-01")).toBe(true);
  });

  it("el día anterior cruza meses y años", () => {
    expect(diaAnterior("2026-11-01")).toBe("2026-10-31");
    expect(diaAnterior("2027-01-01")).toBe("2026-12-31");
    expect(diaAnterior("2028-03-01")).toBe("2028-02-29");
  });

  it("subirle la academia a Leo en noviembre: octubre sigue a $90.000", () => {
    const plan = planGuardarReglas(
      [guardada(1, 0), guardada(2, 1, { nombre: "Academia", concepto: "academia", valor: 90000 })],
      [base, { ...base, nombre: "Academia", concepto: "academia", valor: 100000 }],
      "2026-11-01",
    );
    expect(plan.mantener).toEqual([1]); // la de particulares no cambió: se queda quieta
    expect(plan.cerrar).toEqual([{ id: 2, vigente_hasta: "2026-10-31" }]);
    expect(plan.borrar).toEqual([]);
    expect(plan.insertar).toHaveLength(1);
    expect(plan.insertar[0]).toMatchObject({ valor: 100000, orden: 1, vigente_desde: "2026-11-01" });
  });

  it("guardar sin cambios no toca nada", () => {
    const plan = planGuardarReglas([guardada(1, 0)], [base], "2026-11-01");
    expect(plan).toEqual({ cerrar: [], borrar: [], insertar: [], mantener: [1] });
  });

  it("REORDENAR también es un cambio: el orden decide cuál gana (el sábado de Graciano)", () => {
    const a = { ...base, nombre: "A" };
    const b = { ...base, nombre: "B" };
    const plan = planGuardarReglas([guardada(1, 0, a), guardada(2, 1, b)], [b, a], "2026-11-01");
    expect(plan.mantener).toEqual([]);
    expect(plan.cerrar.map((c) => c.id).sort()).toEqual([1, 2]);
    expect(plan.insertar.map((r) => r.nombre)).toEqual(["B", "A"]);
  });

  it("una regla que arrancaba en el mismo mes se BORRA, no se cierra (nunca llegó a pagar antes)", () => {
    const plan = planGuardarReglas([guardada(1, 0, {}, { vigente_desde: "2026-11-01" })], [{ ...base, valor: 1 }], "2026-11-01");
    expect(plan.borrar).toEqual([1]);
    expect(plan.cerrar).toEqual([]);
  });

  it("corregir desde un mes PASADO recorta también la versión vieja, para que no paguen dos a la vez", () => {
    // Historia: $90k hasta 31-oct, $100k desde 1-nov. Ahora se corrige: $95k desde 1-oct.
    const plan = planGuardarReglas(
      [guardada(1, 0, {}, { activo: false, vigente_hasta: "2026-10-31" }), guardada(2, 0, { valor: 100000 }, { vigente_desde: "2026-11-01" })],
      [{ ...base, valor: 95000 }],
      "2026-10-01",
    );
    expect(plan.cerrar).toEqual([{ id: 1, vigente_hasta: "2026-09-30" }]);
    expect(plan.borrar).toEqual([2]);
    expect(plan.insertar[0]).toMatchObject({ valor: 95000, vigente_desde: "2026-10-01" });
  });

  it("las reglas apagadas antes de existir la vigencia no se tocan ni vuelven a contar", () => {
    const plan = planGuardarReglas([guardada(7, 0, {}, { activo: false, vigente_hasta: null })], [base], "2026-11-01");
    expect(plan.cerrar).toEqual([]);
    expect(plan.borrar).toEqual([]);
    expect(plan.insertar).toHaveLength(1);
  });

  it("la historia que terminó antes del mes elegido queda intacta", () => {
    const plan = planGuardarReglas([guardada(1, 0, {}, { activo: false, vigente_hasta: "2026-07-31" })], [], "2026-11-01");
    expect(plan).toEqual({ cerrar: [], borrar: [], insertar: [], mantener: [] });
  });
});

describe("vigencia: de punta a punta contra la base (Dairon, profesor inactivo)", () => {
  it("un cambio de sueldo solo mueve la liquidación desde el mes elegido", async () => {
    const db = admin();
    const { data: dairon } = await db.from("profiles").select("id").ilike("nombre", "Dairon%").single();
    const pid = dairon!.id as string;
    const { data: antes } = await db.from("profesor_regla").select("*").eq("profesor_id", pid);
    const { data: maxRow } = await db.from("profesor_regla").select("id").order("id", { ascending: false }).limit(1).single();
    const maxId = maxRow!.id as number;
    const { data: serv } = await db.from("servicios").select("id").ilike("nombre", "%academia%").limit(1).single();

    const { guardarReglas } = await import("../src/app/(app)/empleados/actions");
    const { calcularLiquidacion } = await import("../src/lib/liquidacion");
    const actuales = (antes ?? []).filter((r) => r.activo).sort((a, b) => a.orden - b.orden);
    const mismas = actuales.map((r) => ({
      nombre: r.nombre, concepto: r.concepto, metodo: r.metodo, pct: Number(r.pct), valor: r.valor,
      servicio_id: r.servicio_id, escalones: r.escalones, dias: r.dias, hora_desde: r.hora_desde, hora_hasta: r.hora_hasta, umbral: r.umbral,
    }));
    const guardar = (salario: number, mes: string) => {
      const fd = new FormData();
      fd.set("profesorId", pid);
      fd.set("aplicaDesde", mes);
      fd.set("reglas", JSON.stringify([
        ...mismas,
        { nombre: "Academia prueba", concepto: "academia", metodo: "fijo_por_clase", pct: 0, valor: 1, servicio_id: serv!.id, escalones: null, dias: null, hora_desde: null, hora_hasta: null, umbral: null },
        { nombre: "Salario prueba", concepto: "salario", metodo: "salario_fijo", pct: 0, valor: salario, servicio_id: null, escalones: null, dias: null, hora_desde: null, hora_hasta: null, umbral: null },
      ]));
      return guardarReglas({}, fd);
    };
    const fijo = async (ym: string) => {
      const ultimo = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5)), 0).getDate();
      const filas = await calcularLiquidacion(`${ym}-01`, `${ym}-${ultimo}`, 2);
      return filas.find((f) => f.id === pid)?.fijo ?? 0;
    };

    try {
      // 1) Salario de $1M desde agosto: julio no lo ve.
      expect((await guardar(1_000_000, "2026-08")).error).toBeUndefined();
      expect(await fijo("2026-07")).toBe(0);
      expect(await fijo("2026-08")).toBe(1_000_000);
      // Las reglas que no cambiaron siguen siendo las MISMAS filas.
      const { data: tras1 } = await db.from("profesor_regla").select("id, servicio_id, nombre, activo").eq("profesor_id", pid).eq("activo", true);
      for (const r of actuales) expect(tras1!.some((t) => t.id === r.id)).toBe(true);
      // La academia elegida se guarda (antes se borraba al guardar desde la ficha).
      expect(tras1!.find((t) => t.nombre === "Academia prueba")?.servicio_id).toBe(serv!.id);

      // 2) Sube a $2M desde octubre: agosto y septiembre siguen en $1M.
      await guardar(2_000_000, "2026-10");
      expect(await fijo("2026-08")).toBe(1_000_000);
      expect(await fijo("2026-09")).toBe(1_000_000);
      expect(await fijo("2026-10")).toBe(2_000_000);

      // 3) Corrección hacia atrás: eran $3M desde septiembre. Agosto no se mueve y
      //    octubre ya no tiene dos salarios encima.
      await guardar(3_000_000, "2026-09");
      expect(await fijo("2026-08")).toBe(1_000_000);
      expect(await fijo("2026-09")).toBe(3_000_000);
      expect(await fijo("2026-10")).toBe(3_000_000);

      const { data: salarios } = await db
        .from("profesor_regla").select("valor, activo, vigente_desde, vigente_hasta")
        .eq("profesor_id", pid).eq("metodo", "salario_fijo").order("vigente_desde");
      expect(salarios).toEqual([
        { valor: 1_000_000, activo: false, vigente_desde: "2026-08-01", vigente_hasta: "2026-08-31" },
        { valor: 3_000_000, activo: true, vigente_desde: "2026-09-01", vigente_hasta: null },
      ]);
    } finally {
      await db.from("profesor_regla").delete().eq("profesor_id", pid).gt("id", maxId);
      for (const r of antes ?? []) {
        await db.from("profesor_regla")
          .update({ activo: r.activo, vigente_desde: r.vigente_desde, vigente_hasta: r.vigente_hasta, orden: r.orden })
          .eq("id", r.id);
      }
      const { data: despues } = await db.from("profesor_regla").select("*").eq("profesor_id", pid);
      expect((despues ?? []).map((r) => [r.id, r.activo, r.vigente_desde, r.vigente_hasta]).sort())
        .toEqual((antes ?? []).map((r) => [r.id, r.activo, r.vigente_desde, r.vigente_hasta]).sort());
    }
  }, 60000);
});
