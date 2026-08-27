import React from "react";
import { describe, it, expect, vi } from "vitest";
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

/** Un evento que exista de verdad, para no fijar ids a mano. */
async function unEvento() {
  const { data } = await admin().from("eventos").select("id").order("id", { ascending: false }).limit(1);
  const id = data?.[0]?.id;
  if (!id) throw new Error("No hay eventos cargados: esta prueba necesita datos.");
  return String(id);
}

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
    const id = await unEvento();
    const { default: Page } = await import("../src/app/(app)/eventos/[id]/page");
    const t = texto(await render(Page, { params: P({ id }), searchParams: P({}) }));
    expect(t).toContain("Resultado del evento");
    // La sección que trajo casi todo el código nuevo: atar facturas sin pasar por /pagos.
    expect(t).toContain("Facturas del evento");
    expect(t).toContain("Gastos");
    expect(t).toContain("Participantes");
  });

  it("la ficha en modo ampliado (?todas=1) — hace una segunda llamada al RPC", async () => {
    const id = await unEvento();
    const { default: Page } = await import("../src/app/(app)/eventos/[id]/page");
    const t = texto(await render(Page, { params: P({ id }), searchParams: P({ todas: "1" }) }));
    expect(t).toContain("Facturas del evento");
    // En ampliado la lista cambia de título; el aviso del cierre sigue con el conteo estricto.
    expect(t).toContain("Todas las facturas de las fechas");
  });

  it("inscribir NO da el pago por hecho", async () => {
    const id = await unEvento();
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
