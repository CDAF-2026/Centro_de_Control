import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createClient as sbClient } from "@supabase/supabase-js";

/**
 * `/paquetes` se renderiza entero contra los datos reales (mismo arnés que
 * academias-render): partido por deporte, inactivos al final con candado y el
 * formulario de "Nuevo paquete" sin precio. Rediseño del 30-sep-2026.
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
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const PERFIL = { id: "", role: "superadmin", nombre: "test", activo: true };
const admin = () =>
  sbClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
const texto = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("/paquetes", () => {
  it("renderiza por deporte, con los inactivos al final y el formulario sin precio", async () => {
    const { default: Page } = await import("../src/app/(app)/paquetes/page");
    const html = renderToStaticMarkup(await Page());
    const t = texto(html);

    expect(t).toContain("Paquetes de clases");
    const iPadel = t.indexOf("Pádel");
    const iTenis = t.indexOf("Tenis");
    expect(iPadel).toBeGreaterThan(-1);
    expect(iTenis).toBeGreaterThan(-1);

    // Los inactivos, si los hay, van después de las secciones por deporte.
    const iInactivos = t.indexOf("Inactivos");
    if (iInactivos > -1) {
      expect(iInactivos).toBeGreaterThan(iPadel);
      expect(iInactivos).toBeGreaterThan(iTenis);
      expect(html).toContain('aria-label="Inactivo"');
    }

    // Nuevo paquete: nombre, clases y deporte. Ni precio ni descuento.
    expect(t).toContain("Nuevo paquete");
    expect(html).toContain('name="numClases"');
    expect(html).not.toContain('name="precio"');
    expect(html).not.toContain('name="descuento"');
  });
});
