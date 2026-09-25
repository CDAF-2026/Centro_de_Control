import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

/**
 * Grupos de Siigo reconocidos solos (`siigo_catalogo_aplicar`, migración 20260925110000).
 * Todo corre en SIMULACRO: la función calcula, revierte y devuelve lo que habría hecho, así
 * que estas pruebas no dejan servicios ni notas de mentira en la base.
 */

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

type Prod = { codigo: string; nombre: string; grupo_id: number | null; grupo: string | null };
type Resultado = {
  servicio_por_codigo: Record<string, number | null>;
  creados: { servicio_id: number; nombre: string; siigo_grupo_id: number }[];
  renombrados: { servicio_id: number; antes: string; ahora: string }[];
  lineas_recategorizadas: number;
};

async function simular(productos: Prod[]): Promise<Resultado> {
  const { error } = await db.rpc("siigo_catalogo_aplicar", { p_productos: productos, p_simulacro: true });
  expect(error?.message).toBe("SIMULACRO");
  return JSON.parse(error!.details);
}

let catalogo: Prod[] = [];

beforeAll(async () => {
  // El catálogo tal como está hoy (grupo + número), reconstruido del caché.
  const { data } = await db
    .from("siigo_productos")
    .select("codigo, nombre, account_group, account_group_id")
    .not("account_group_id", "is", null)
    .limit(5000);
  catalogo = (data ?? []).map((p) => ({
    codigo: p.codigo, nombre: p.nombre ?? "", grupo_id: p.account_group_id, grupo: p.account_group,
  }));
});

describe("catálogo de Siigo → servicios", () => {
  it("el catálogo de hoy no crea ni renombra nada (sin falsas alarmas)", async () => {
    expect(catalogo.length).toBeGreaterThan(400);
    const r = await simular(catalogo);
    expect(r.creados).toEqual([]);
    expect(r.renombrados).toEqual([]);
  });

  it("si el club RENOMBRA un grupo, se sigue reconociendo por su número y el servicio toma el nombre nuevo", async () => {
    const renombrado = catalogo.map((p) => (p.grupo_id === 2014 ? { ...p, grupo: "Cafetería y bar" } : p));
    const r = await simular(renombrado);
    const cafe = catalogo.find((p) => p.grupo_id === 2014)!;
    expect(r.servicio_por_codigo[cafe.codigo]).toBe(5); // sigue siendo Cafetería, no "Sin categoría"
    expect(r.renombrados).toEqual([{ servicio_id: 5, antes: "Cafetería", ahora: "Cafetería y bar" }]);
    expect(r.creados).toEqual([]);
  });

  it("un grupo NUEVO crea su servicio con el nombre de Siigo y sus productos entran ahí", async () => {
    const r = await simular([
      ...catalogo,
      { codigo: "ZZ-PRUEBA-1", nombre: "Prueba", grupo_id: 999001, grupo: "Clínicas de verano" },
      { codigo: "ZZ-PRUEBA-2", nombre: "Prueba 2", grupo_id: 999001, grupo: "Clínicas de verano" },
    ]);
    expect(r.creados).toHaveLength(1);
    expect(r.creados[0]).toMatchObject({ nombre: "Clínicas de verano", siigo_grupo_id: 999001 });
    expect(r.servicio_por_codigo["ZZ-PRUEBA-1"]).toBe(r.creados[0].servicio_id);
    expect(r.servicio_por_codigo["ZZ-PRUEBA-2"]).toBe(r.creados[0].servicio_id);
  });

  it("un grupo cuyos productos ya reclama un servicio por código NO crea otro (CONVENIOS COLEGIOS)", async () => {
    const r = await simular([...catalogo, { codigo: "AF683", nombre: "Convenio", grupo_id: 12083, grupo: "CONVENIOS COLEGIOS" }]);
    expect(r.creados).toEqual([]);
    expect(r.servicio_por_codigo["AF683"]).toBe(14); // Alianzas colegios
  });

  it("el CÓDIGO le sigue ganando al grupo (matrículas)", async () => {
    const r = await simular(catalogo);
    expect(r.servicio_por_codigo["AF209"]).toBe(23); // Matrícula Tenis, aunque su grupo es Academia recreativa tenis
  });

  it("el simulacro no deja nada escrito", async () => {
    const { count: antes } = await db.from("servicios").select("*", { count: "exact", head: true });
    await simular([...catalogo, { codigo: "ZZ-PRUEBA-3", nombre: "x", grupo_id: 999002, grupo: "Grupo fantasma" }]);
    const { count: despues } = await db.from("servicios").select("*", { count: "exact", head: true });
    expect(despues).toBe(antes);
    const { count: fantasma } = await db.from("siigo_productos").select("*", { count: "exact", head: true }).like("codigo", "ZZ-PRUEBA-%");
    expect(fantasma).toBe(0);
  });

  it("solo el servidor puede llamarla: con la llave pública se rechaza", async () => {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false },
    });
    const { error } = await anon.rpc("siigo_catalogo_aplicar", { p_productos: [], p_simulacro: true });
    expect(error).not.toBeNull();
    expect(error!.message).not.toBe("SIMULACRO");
  });
});
