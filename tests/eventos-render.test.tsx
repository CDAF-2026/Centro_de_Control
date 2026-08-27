import React from "react";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createClient as sbClient } from "@supabase/supabase-js";

/**
 * Render de las pantallas de EVENTOS. Mismo motivo que `academias-render`: el bug del
 * 25-ago-2026 enseñó que ni `tsc` ni `next build` ni pedir la URL con curl detectan un
 * error de ejecución en una página dinámica — solo renderizarla de verdad.
 *
 * Se agrega en ago-2026 tras reescribir buena parte de `/eventos/[id]`: facturas del
 * evento, candidatas, modal de detalle, P&G y el pago de participantes. Era la pantalla
 * con más código nuevo y la única sin red.
 *
 * No comprueba cifras (cambian a diario): comprueba que la página se ejecute entera.
 *
 * ⚠️ Se salta el guardia de sesión y usa service_role, igual que la de academias: aquí
 * se prueba el RENDER, no los permisos. Efecto secundario conocido del arnés:
 * `staff_docentes` exige `auth.uid()`, así que la lista de profesores sale vacía.
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
  default: ({ href, children, ...r }: any) => React.createElement("a", { href: String(href), ...r }, children),
}));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); },
  redirect: (u: string) => { throw new Error("REDIRECT " + u); },
  useRouter: () => ({ push() {}, refresh() {}, replace() {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {}, refresh: () => {} }));

const PERFIL = { id: "00000000-0000-0000-0000-000000000000", role: "superadmin", nombre: "test", activo: true };
const admin = () =>
  sbClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

const P = <T,>(o: T) => Promise.resolve(o);
const render = async (fn: any, props: any) => renderToStaticMarkup(await fn(props));
const texto = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

/**
 * Evento propio, ABIERTO y en 2027, creado y borrado por la prueba.
 *
 * No sirve tomar "el evento más reciente" de la base: en cuanto el club cierra un torneo
 * la ficha esconde los formularios (candidatas, gasto, inscripción) y las pruebas fallan
 * sin que nada esté roto. Y va en 2027 para no cruzarse con facturas reales.
 */
let eventoId = "";
let eventoIdNum = 0;

beforeAll(async () => {
  const { data, error } = await admin()
    .from("eventos")
    .insert({ nombre: "ZZZ prueba automática (render)", fecha_inicio: "2027-03-06", fecha_fin: "2027-03-07" })
    .select("id")
    .single();
  if (error) throw new Error("No se pudo sembrar el evento de prueba: " + error.message);
  eventoIdNum = data.id;
  eventoId = String(data.id);
});

afterAll(async () => {
  if (eventoIdNum) await admin().from("eventos").delete().eq("id", eventoIdNum);
  const { count } = await admin()
    .from("eventos")
    .select("*", { count: "exact", head: true })
    .eq("id", eventoIdNum);
  if (count) throw new Error("Quedó el evento de prueba sin borrar: " + eventoIdNum);
});

describe("las pantallas de eventos se renderizan enteras", () => {
  it("el listado", async () => {
    const { default: Page } = await import("../src/app/(app)/eventos/page");
    expect(texto(await render(Page, {}))).toContain("Eventos");
  });

  it("el formulario de nuevo evento", async () => {
    const { default: Page } = await import("../src/app/(app)/eventos/nuevo/page");
    expect(texto(await render(Page, {}))).toContain("Nuevo evento");
  });

  it("la ficha del evento, con P&G, facturas y participantes", async () => {
    const id = eventoId;
    const { default: Page } = await import("../src/app/(app)/eventos/[id]/page");
    const t = texto(await render(Page, { params: P({ id }), searchParams: P({}) }));
    expect(t).toContain("Resultado del evento");
    // La sección que trajo casi todo el código nuevo: atar facturas sin pasar por /pagos.
    expect(t).toContain("Facturas del evento");
    expect(t).toContain("Gastos");
    expect(t).toContain("Participantes");
  });

  it("la ficha en modo ampliado (?todas=1) — hace una segunda llamada al RPC", async () => {
    const id = eventoId;
    const { default: Page } = await import("../src/app/(app)/eventos/[id]/page");
    const t = texto(await render(Page, { params: P({ id }), searchParams: P({ todas: "1" }) }));
    expect(t).toContain("Facturas del evento");
    // En ampliado la lista cambia de título; el aviso del cierre sigue con el conteo estricto.
    expect(t).toContain("Todas las facturas de las fechas");
  });

  it("un gasto puede ir en $0 (patrocinios que el club deja visibles)", async () => {
    const id = eventoId;
    const { default: Page } = await import("../src/app/(app)/eventos/[id]/page");
    const html = await render(Page, { params: P({ id }), searchParams: P({}) });
    // El campo estuvo en min=1 y eso impedía registrar lo que cubrió un patrocinador,
    // que al club le cuesta $0 pero quiere ver en el detalle del torneo.
    // Se busca por el placeholder porque hay DOS campos "monto" en la ficha (el del gasto
    // y el de la inscripción), y el orden de los atributos en el HTML no está garantizado.
    const campo = html.match(/<input[^>]*placeholder="Monto \(COP\)"[^>]*>/)?.[0] ?? "";
    expect(campo, "no se encontró el campo de monto del gasto").not.toBe("");
    expect(campo).toContain('min="0"');
  });

  it("inscribir NO da el pago por hecho", async () => {
    const id = eventoId;
    const { default: Page } = await import("../src/app/(app)/eventos/[id]/page");
    const t = texto(await render(Page, { params: P({ id }), searchParams: P({}) }));
    // La casilla existe y arranca sin marcar: el pago se registra a mano, no por teclear
    // el monto (que es lo que DEBE, no lo que entregó).
    expect(t).toContain("Ya pagó");
    const html = await render(Page, { params: P({ id }), searchParams: P({}) });
    expect(html).toMatch(/name="pagado"/);
    expect(html).not.toMatch(/name="pagado"[^>]*\schecked/);
  });
});
