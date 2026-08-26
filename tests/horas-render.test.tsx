import React from "react";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createClient as sbClient } from "@supabase/supabase-js";

/**
 * El reporte de horas, renderizado de verdad y con datos.
 *
 * A diferencia de las otras pruebas de render, esta SIEMBRA turnos: el valor no
 * está solo en que la página no reviente, sino en comprobar que las cifras que
 * pinta son las que salen del cálculo. Los turnos de prueba son de 2027 para no
 * cruzarse jamás con datos reales, y se borran en un `finally`.
 */

vi.mock("@/lib/auth", () => ({
  requireRole: async () => PERFIL,
  requireProfile: async () => PERFIL,
  getProfile: async () => PERFIL,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => admin(),
  createAdminClient: async () => admin(),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...r }: any) =>
    React.createElement("a", { href: String(href), ...r }, children),
}));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); },
  redirect: (u: string) => { throw new Error("REDIRECT " + u); },
  useRouter: () => ({ push() {}, refresh() {}, replace() {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));
vi.mock("next/cache", () => ({
  refresh: () => {},
  revalidatePath: () => {},
  revalidateTag: () => {},
}));

const PERFIL = {
  id: "00000000-0000-0000-0000-000000000000",
  role: "superadmin",
  nombre: "Laura",
  activo: true,
  marca_turno: false,
};
const admin = () =>
  sbClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

const P = <T,>(o: T) => Promise.resolve(o);
const render = async (fn: any, props: any) => renderToStaticMarkup(await fn(props));
const texto = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

/** Quincena 2 de septiembre de 2027. Semana del 20 al 26, que cae entera dentro. */
const YM = "2027-09";
const PERIODO = "q2";
let empleado: string;
const creados: number[] = [];

/** Inserta un turno (horas en texto local de Bogotá) y devuelve su id. */
async function sembrar(dia: string, entrada: string, salida: string | null, almuerzo?: [string, string]) {
  const sb = admin();
  const { data, error } = await sb
    .from("turno")
    .insert({
      perfil_id: empleado,
      inicio_el: `${dia}T${entrada}:00-05:00`,
      fin_el: salida ? `${dia}T${salida}:00-05:00` : null,
      foto_inicio_path: "prueba/e.jpg",
      foto_fin_path: salida ? "prueba/s.jpg" : null,
    } as any)
    .select("id")
    .single();
  if (error) throw error;
  creados.push(data!.id);
  if (almuerzo) {
    const { error: e2 } = await sb.from("turno_pausa").insert({
      turno_id: data!.id,
      inicio_el: `${dia}T${almuerzo[0]}:00-05:00`,
      fin_el: `${dia}T${almuerzo[1]}:00-05:00`,
    } as any);
    if (e2) throw e2;
  }
  return data!.id;
}

/**
 * ⚠️ Se usa a JUAN a propósito, y no "el primero que marque turnos".
 *
 * Esta prueba escribe filas de verdad (las otras van en transacciones que se
 * revierten), y una de ellas es un turno ABIERTO. `turno_abierto_uidx` impide
 * dos turnos abiertos por persona, así que si `turnos-marcar` o `turnos-horas`
 * —que usan a Santiago— corrían en paralelo con esta, chocaban con
 * "duplicate key value violates unique constraint". Y solo pasaba al correr la
 * suite completa: cada archivo por separado pasaba en verde.
 */
const CORREO_EMPLEADO = "gaviriajuan41@gmail.com";

beforeAll(async () => {
  const sb = admin();
  const { data: u } = await sb.auth.admin.listUsers({ perPage: 200 });
  empleado = u?.users.find((x) => x.email === CORREO_EMPLEADO)?.id as string;
  expect(empleado, `hace falta el perfil de prueba ${CORREO_EMPLEADO}`).toBeTruthy();

  // Por si una corrida anterior murió a mitad y dejó basura en 2027.
  await sb.from("turno").delete().eq("perfil_id", empleado).gte("inicio_el", "2027-01-01");

  // 7 h diurnas justas.
  await sembrar("2027-09-20", "07:00", "15:00", ["12:00", "13:00"]);
  // 9 h de tarde: 5 diurnas + 2 nocturnas (19–21) + 2 extra nocturnas (21–23).
  await sembrar("2027-09-21", "13:00", "23:00", ["16:00", "17:00"]);
  // 10 h seguidas SIN almuerzo: 7 ordinarias + 3 extra diurnas. Debe avisar.
  await sembrar("2027-09-22", "07:00", "17:00");
  // Turno abierto: aporta cero y debe avisar.
  await sembrar("2027-09-23", "07:00", null);
});

afterAll(async () => {
  const sb = admin();
  if (creados.length) await sb.from("turno").delete().in("id", creados);
  const { data } = await sb.from("turno").select("id").gte("inicio_el", "2027-01-01");
  expect(data ?? [], "quedaron turnos de prueba sin borrar").toHaveLength(0);
});

describe("el reporte de horas", () => {
  it("muestra las cifras del cálculo, columna por columna", async () => {
    const { default: Page } = await import("../src/app/(app)/horas/page");
    const t = texto(await render(Page, { searchParams: P({ periodo: PERIODO, ym: YM }) }));

    expect(t).toContain("Horas del personal");
    // 19 diurnas · 2 nocturnas · 3 extra diurnas · 2 extra nocturnas = 26 en total.
    expect(t).toContain("19:00");
    expect(t).toContain("3:00");
    expect(t).toContain("26:00");
  });

  it("no suma las horas de todos: no hay total general", async () => {
    // Decisión de Laura: el total que importa es el de cada persona.
    const { default: Page } = await import("../src/app/(app)/horas/page");
    const html = await render(Page, { searchParams: P({ periodo: PERIODO, ym: YM }) });
    expect(html.match(/<tfoot/)).toBeNull();
    // Una sola fila por persona más la de encabezados; ninguna fila de totales.
    const filas = (html.match(/<tr/g) ?? []).length;
    const personas = await admin().from("profiles").select("id").eq("marca_turno", true);
    expect(filas).toBe((personas.data ?? []).length + 1);
  });

  it("avisa de lo que hay que revisar, con nombre y día", async () => {
    const { default: Page } = await import("../src/app/(app)/horas/page");
    const t = texto(await render(Page, { searchParams: P({ periodo: PERIODO, ym: YM }) }));
    expect(t).toContain("Por revisar");
    expect(t).toContain("no cerró el turno");
    expect(t).toContain("sin marcar almuerzo");
  });

  it("un periodo sin turnos no revienta", async () => {
    const { default: Page } = await import("../src/app/(app)/horas/page");
    const t = texto(await render(Page, { searchParams: P({ periodo: "q1", ym: "2027-01" }) }));
    expect(t).toContain("Horas del personal");
    expect(t).not.toContain("Por revisar");
  });
});

describe("el detalle de una persona", () => {
  it("parte el periodo en semanas y lista los turnos", async () => {
    const { default: Page } = await import("../src/app/(app)/horas/[id]/page");
    const t = texto(
      await render(Page, {
        params: P({ id: empleado }),
        searchParams: P({ periodo: PERIODO, ym: YM }),
      }),
    );
    expect(t).toContain("Semana a semana");
    expect(t).toContain("el tope de 42 h es semanal");
    // La semana del 20 al 26 de septiembre, con sus 26 horas.
    expect(t).toContain("20 – 26 de septiembre");
    expect(t).toContain("26:00");
    // El turno abierto se ve y se dice que no tiene salida.
    expect(t).toContain("sin marcar");
    expect(t).toContain("Corregir");
  });

  it("una persona sin turnos en el periodo lo dice, no sale en blanco", async () => {
    const { default: Page } = await import("../src/app/(app)/horas/[id]/page");
    const t = texto(
      await render(Page, {
        params: P({ id: empleado }),
        searchParams: P({ periodo: "q1", ym: "2027-01" }),
      }),
    );
    expect(t).toContain("Sin turnos en este periodo");
  });

  it("una persona que no existe da 404, no una pantalla rota", async () => {
    const { default: Page } = await import("../src/app/(app)/horas/[id]/page");
    await expect(
      render(Page, {
        params: P({ id: "00000000-0000-0000-0000-0000000000ff" }),
        searchParams: P({ periodo: PERIODO, ym: YM }),
      }),
    ).rejects.toThrow("NOT_FOUND");
  });
});
