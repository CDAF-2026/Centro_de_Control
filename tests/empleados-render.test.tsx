import React from "react";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createClient as sbClient } from "@supabase/supabase-js";

/**
 * La ficha del empleado muestra las REGLAS DE PAGO de quien las tenga, no solo
 * del rol "profesor" (24-sep-2026). Leo Ruíz es coordinador deportivo, dicta
 * pádel y se le paga por reglas: su ficha no las mostraba y no había dónde
 * verlas ni editarlas. Es el mismo tropiezo "rol ≠ pago" que ya se arregló en
 * la liquidación con esDocente().
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
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

// El id se rellena con un superadministrador REAL antes de correr: `cerrarClase`
// escribe `clases.registrada_por`, que tiene FK a `profiles`, así que un uuid
// inventado revienta con un error de llave foránea que no tiene nada que ver con
// lo que se está probando. Se resuelve en tiempo de ejecución y no a mano para
// no fijar un id que el club puede mover.
const PERFIL = { id: "", role: "superadmin", nombre: "test", activo: true };
beforeAll(async () => {
  const { data } = await admin().from("profiles").select("id").eq("role", "superadmin").eq("activo", true).limit(1);
  if (!data?.[0]) throw new Error("No hay superadministrador: esta prueba lo necesita.");
  PERFIL.id = data[0].id;
});
const admin = () =>
  sbClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

const P = <T,>(o: T) => Promise.resolve(o);
const render = async (fn: any, props: any) => renderToStaticMarkup(await fn(props));
const texto = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");


describe("ficha del empleado", () => {
  it("un coordinador que dicta clases ve sus reglas de pago", async () => {
    const { data: r } = await admin()
      .from("profesor_regla")
      .select("profesor_id, nombre, profiles!inner(role)")
      .eq("activo", true)
      .neq("profiles.role", "profesor")
      .limit(1)
      .single();
    expect(r).toBeTruthy();
    const { default: Page } = await import("../src/app/(app)/empleados/[id]/page");
    const html = await render(Page, { params: P({ id: r!.profesor_id }) });
    const t = texto(html);
    expect(t).toContain("Compensación");
    expect(html).toContain(r!.nombre);
  });
});
