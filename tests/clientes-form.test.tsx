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

/**
 * Ficha unificada con la "FICHA PERSONAL 2026" del club (1-oct-2026, decisión D2 del plan de
 * consentimiento): padre y madre por separado, lugar de nacimiento y dirección. Nada de lo que la
 * ficha ya tenía se quitó.
 */
describe("ficha unificada (padre y madre, lugar de nacimiento, dirección)", () => {
  const admin2 = admin;

  it("el formulario trae los campos nuevos y los dos bloques de acudiente para un menor", async () => {
    const { ClienteForm } = await import("../src/app/(app)/clientes/cliente-form");
    const acu = { nombre: "Noraima Henao", documento: "1038406746", telefono: "3180799236", parentesco: "Mamá", rol: "madre" as const };
    const html = renderToStaticMarkup(<ClienteForm cliente={MENOR} acudiente={acu} />);
    const t = texto(html);
    expect(html).toContain('name="lugarNacimiento"');
    expect(html).toContain('name="direccion"');
    expect(t).toContain("Acudiente principal");
    expect(t).toContain("Segundo acudiente");
    expect(html).toContain('name="acudienteRol"');
    expect(html).toContain('name="acudiente2Nombre"');
    expect(html).toContain('name="acudiente2Rol"');
    // Lo viejo sigue: emergencia, facturación y deportes no se fueron.
    expect(t).toContain("Contacto de emergencia");
    expect(t).toContain("Facturación");
    expect(t).toContain("Deportes");
    // El segundo arranca con el rol contrario (principal = madre → segundo = padre).
    expect(html).toMatch(/name="acudiente2Rol"[\s\S]*?<option value="padre" selected=""/);
  });

  it("adulto: campos nuevos sí, bloques de acudiente no", async () => {
    const { ClienteForm } = await import("../src/app/(app)/clientes/cliente-form");
    const html = renderToStaticMarkup(<ClienteForm cliente={{ ...MENOR, fecha_nacimiento: "1990-01-01" }} />);
    expect(html).toContain('name="direccion"');
    expect(texto(html)).not.toContain("Acudiente principal");
    expect(html).not.toContain('name="acudientesVisibles"');
  });

  it("crear un menor con padre Y madre deja los dos atados a la ficha, el principal en acudiente_id", async () => {
    const { createCliente } = await import("../src/app/(app)/clientes/actions");
    const sb = admin2();
    const apellido = `Prueba Unificada ${Date.now()}`;
    const fd = new FormData();
    fd.set("nombres", "Niño"); fd.set("apellidos", apellido);
    fd.set("fechaNacimiento", `${new Date().getFullYear() - 8}-05-05`);
    fd.set("lugarNacimiento", "Rionegro"); fd.set("direccion", "Calle Falsa 123");
    fd.set("acudienteRol", "madre"); fd.set("acudienteNombre", "Mamá Prueba"); fd.set("acudienteDocumento", "9990000001");
    fd.set("acudienteTelefono", "3000000001"); fd.set("acudienteEmail", "mama.prueba@example.com");
    fd.set("acudiente2Rol", "padre"); fd.set("acudiente2Nombre", "Papá Prueba"); fd.set("acudiente2Telefono", "3000000002");
    let clienteId: number | null = null;
    try {
      // createCliente termina con redirect(), que el mock convierte en excepción.
      await createCliente({}, fd).catch((e: Error) => { if (!/REDIRECT/.test(e.message)) throw e; });
      const { data: cli } = await sb.from("clientes").select("id, acudiente_id, direccion, lugar_nacimiento").eq("apellidos", apellido).single();
      clienteId = cli!.id;
      expect(cli!.direccion).toBe("Calle Falsa 123");
      expect(cli!.lugar_nacimiento).toBe("Rionegro");
      const { data: acus } = await sb.from("acudientes").select("id, rol, nombre, cliente_id, email").eq("cliente_id", clienteId).order("id");
      expect(acus).toHaveLength(2);
      const principal = acus!.find((a) => a.id === cli!.acudiente_id)!;
      expect(principal.rol).toBe("madre");
      expect(principal.email).toBe("mama.prueba@example.com");
      expect(acus!.find((a) => a.id !== cli!.acudiente_id)!.rol).toBe("padre");
      // El titular espejado también lleva el lugar de nacimiento (trigger de 0066 ampliado).
      const { data: tit } = await sb.from("cliente_miembros").select("lugar_nacimiento").eq("cliente_id", clienteId).eq("es_titular", true).single();
      expect(tit!.lugar_nacimiento).toBe("Rionegro");
    } finally {
      if (clienteId) {
        await sb.from("cliente_miembros").delete().eq("cliente_id", clienteId);
        await sb.from("clientes").update({ acudiente_id: null, es_menor: false }).eq("id", clienteId);
        await sb.from("acudientes").delete().eq("cliente_id", clienteId);
        await sb.from("clientes").delete().eq("id", clienteId);
      }
    }
  });
});
