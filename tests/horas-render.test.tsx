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
  // ⚠️ Aquí NO se siembra un turno abierto, aunque el reporte lo avise. Esta
  // prueba escribe filas de verdad, y `turno_abierto_uidx` solo permite UNO
  // abierto por persona: el día que Juan estuviera trabajando —o se le olvidara
  // cerrar, que es justo lo que pasó el 9-sep-2026— reventaba con "duplicate
  // key", según la hora a la que corrieran las pruebas. La detección de "sin
  // cerrar" se prueba abajo sobre `revisar()`, que es donde vive.
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

describe("las fotos del turno", () => {
  it("cada foto es un botón que abre el modal, con su etiqueta", async () => {
    const { default: Page } = await import("../src/app/(app)/horas/[id]/page");
    const html = await render(Page, {
      params: P({ id: empleado }),
      searchParams: P({ periodo: PERIODO, ym: YM }),
    });
    // Ojo: la etiqueta vive en `title`/`aria-label`, así que se busca en el HTML
    // crudo — `texto()` borra los atributos.
    // Los turnos sembrados apuntan a fotos que no existen en Storage, así que el
    // enlace firmado no se genera y sale el hueco de "sin foto". Lo que se
    // comprueba aquí es que cada marcación tiene su casilla, etiquetada.
    expect(html).toContain("Sin foto de entrada");
    expect(html).toContain("Sin foto de salida");
    // El turno abierto no tiene salida: su casilla existe igual, vacía.
    expect((html.match(/Sin foto de salida/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it("una foto con enlace se pinta como botón que abre el detalle", async () => {
    const { FotoTurno } = await import("../src/app/(app)/horas/foto-turno");
    const html = renderToStaticMarkup(
      React.createElement(FotoTurno as any, {
        url: "https://ejemplo/firma.jpg",
        momento: "Entrada",
        dia: "mié 26 ago",
        hora: "5:32 a. m.",
        nombre: "Camila",
      }),
    );
    expect(html).toContain("<button");
    expect(html).toContain("https://ejemplo/firma.jpg");
    expect(html).toContain("Ver la foto de entrada de Camila");
  });

  it("un turno creado a mano dice «sin foto», no deja el hueco en blanco", async () => {
    const { FotoTurno } = await import("../src/app/(app)/horas/foto-turno");
    const html = renderToStaticMarkup(
      React.createElement(FotoTurno as any, {
        url: null,
        momento: "Salida",
        dia: "mié 26 ago",
        hora: null,
        nombre: "Camila",
      }),
    );
    expect(html).not.toContain("<button");
    expect(html).toContain("Sin foto de salida");
  });
});

describe("el coordinador administrativo lo ve, pero sin botones de corregir", () => {
  it("el reporte le sale completo", async () => {
    PERFIL.role = "coord_admin";
    const { default: Page } = await import("../src/app/(app)/horas/page");
    const t = texto(await render(Page, { searchParams: P({ periodo: PERIODO, ym: YM }) }));
    expect(t).toContain("Horas del personal");
    expect(t).toContain("26:00");
    PERFIL.role = "superadmin";
  });

  it("en el detalle NO aparece «Corregir» ni «Agregar un turno»", async () => {
    // La base ya lo rechaza (`private.turno_exige_sa`); esto evita ofrecerle un
    // botón que le iba a fallar. Las dos capas beben de PUEDE_CORREGIR_TURNO.
    const { default: Page } = await import("../src/app/(app)/horas/[id]/page");
    const props = {
      params: P({ id: empleado }),
      searchParams: P({ periodo: PERIODO, ym: YM }),
    };

    PERFIL.role = "coord_admin";
    const suyo = texto(await render(Page, props));
    expect(suyo).toContain("Semana a semana");
    expect(suyo).not.toContain("Corregir");
    expect(suyo).not.toContain("Agregar un turno que no se marcó");

    PERFIL.role = "superadmin";
    const delSa = texto(
      await render(Page, {
        params: P({ id: empleado }),
        searchParams: P({ periodo: PERIODO, ym: YM }),
      }),
    );
    expect(delSa).toContain("Corregir");
    expect(delSa).toContain("Agregar un turno que no se marcó");
  });
});

describe("qué se considera «por revisar»", () => {
  /** Un turno mínimo con lo que mira `revisar()`. */
  const turno = (extra: Record<string, unknown>) => ({
    id: 1,
    perfil_id: "p1",
    dia: "2027-09-23",
    inicio_el: "2027-09-23T12:00:00Z",
    fin_el: "2027-09-23T20:00:00Z",
    minutos: 420,
    minutos_pausa: 60,
    n_pausas: 1,
    pausa_abierta: false,
    foto_inicio_path: "a.jpg",
    foto_fin_path: "b.jpg",
    origen: "app",
    ajustado_por: null,
    ajuste_motivo: null,
    ...extra,
  });

  it("un turno sin salida es «sin cerrar»", async () => {
    const { revisar } = await import("../src/lib/turnos");
    const r = revisar([
      turno({ fin_el: null, minutos: null, foto_fin_path: null }) as any,
      turno({ id: 2 }) as any,
    ]);
    expect(r.sinCerrar.map((t) => t.id)).toEqual([1]);
  });

  it("un turno largo sin pausa es «sin almuerzo»; uno corto no", async () => {
    const { revisar } = await import("../src/lib/turnos");
    const r = revisar([
      turno({ id: 1, minutos: 600, n_pausas: 0 }) as any, // 10 h seguidas
      turno({ id: 2, minutos: 240, n_pausas: 0 }) as any, // 4 h: normal
    ]);
    expect(r.sinAlmuerzo.map((t) => t.id)).toEqual([1]);
  });

  it("un turno creado a mano no cuenta como «sin foto»: nunca la tuvo", async () => {
    const { revisar } = await import("../src/lib/turnos");
    const r = revisar([
      turno({ id: 1, origen: "ajuste", foto_inicio_path: null, foto_fin_path: null }) as any,
      turno({ id: 2, foto_fin_path: null }) as any,
    ]);
    expect(r.sinFoto.map((t) => t.id)).toEqual([2]);
  });
});
