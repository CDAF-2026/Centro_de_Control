import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createClient as sbClient } from "@supabase/supabase-js";

/**
 * Crear y editar la ficha usan UN SOLO formulario (24-sep-2026). Eran dos copias y la de crear
 * no tenía el bloque de facturación ni la casilla de "mismos datos": recepción guardaba, volvía a
 * editar y los llenaba ahí (video del club, 23-sep-2026).
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

const PERFIL = { id: "", role: "superadmin", nombre: "test", activo: true };
const admin = () =>
  sbClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
const render = async (fn: any, props: any = {}) => renderToStaticMarkup(await fn(props));
const texto = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const MENOR = {
  id: 1, nombres: "Luciana", apellidos: "Prueba", documento: null, tipo_documento: null,
  fecha_nacimiento: `${new Date().getFullYear() - 7}-01-01`, celular: null, email: null, eps: null, rh: null,
  emergencia_nombre: "Noraima Henao", emergencia_celular: "3180799236", emergencia_parentesco: "Mamá",
  factura_a_nombre: null, factura_a_nit: null, factura_tipo: null, factura_email: null, deportes: ["tenis"],
};

describe("formulario de cliente", () => {
  it("CREAR ya trae el bloque de facturación, sin tener que guardar y volver a editar", async () => {
    const { default: Page } = await import("../src/app/(app)/clientes/nuevo/page");
    const html = await render(Page);
    const t = texto(html);
    expect(t).toContain("Facturación");
    expect(html).toContain('name="facturaANit"');
    expect(html).toContain('name="facturaEmail"');
    expect(t).toContain("Guardar cliente");
  });

  it("menor: la casilla vive en el ACUDIENTE y copia el contacto de emergencia", async () => {
    const { ClienteForm } = await import("../src/app/(app)/clientes/cliente-form");
    const acu = { nombre: "Noraima Henao", documento: "1038406746", telefono: "3180799236", parentesco: "Mamá" };
    const html = renderToStaticMarkup(<ClienteForm cliente={MENOR} acudiente={acu} />);
    const t = texto(html);
    expect(t).toContain("Usar los mismos datos del contacto de emergencia");
    // Coinciden → arranca marcada, y el acudiente queda de solo lectura salvo el documento.
    expect(html).toMatch(/<input type="checkbox" class="accent-lime size-4" checked=""\/>Usar los mismos/);
    expect(html).toMatch(/name="acudienteNombre"[^>]*readOnly=""|readOnly=""[^>]*name="acudienteNombre"/);
    expect(html).not.toMatch(/name="acudienteDocumento"[^>]*readOnly=""|readOnly=""[^>]*name="acudienteDocumento"/);
    // La casilla vieja (en la emergencia, copiando al revés) ya no existe.
    expect(t).not.toContain("Usar los mismos datos del acudiente");
  });

  it("adulto: no hay bloque de acudiente ni casilla", async () => {
    const { ClienteForm } = await import("../src/app/(app)/clientes/cliente-form");
    const html = renderToStaticMarkup(<ClienteForm cliente={{ ...MENOR, fecha_nacimiento: "1990-01-01" }} />);
    expect(texto(html)).not.toContain("Acudiente");
  });

  it("crear con un NIT de facturación ajeno se rechaza ANTES de escribir nada", async () => {
    const { data } = await admin().from("clientes").select("documento, nombres").not("documento", "is", null).limit(1).single();
    const { createCliente } = await import("../src/app/(app)/clientes/actions");
    const fd = new FormData();
    fd.set("nombres", "Prueba"); fd.set("apellidos", "Choque NIT");
    fd.set("facturaANit", data!.documento!);
    const r = await createCliente({}, fd);
    expect(r.fieldErrors?.facturaANit).toMatch(/otro cliente/);
    const { count } = await admin().from("clientes").select("id", { count: "exact", head: true }).eq("apellidos", "Choque NIT");
    expect(count).toBe(0);
  });
});
