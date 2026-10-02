import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Las pantallas públicas del registro por QR (Fase 2). Montan las páginas de verdad
 * con `renderToStaticMarkup` para cazar los `ReferenceError` que el build no ve
 * (handoff §8.C). La versión vigente y la sesión se simulan: así se prueba la
 * puerta cerrada ("En preparación") y la abierta, sin tocar la base.
 */
vi.mock("next/link", () => ({
  default: ({ href, children, ...r }: any) => React.createElement("a", { href: String(href), ...r }, children),
}));
vi.mock("next/image", () => ({
  default: (p: any) => React.createElement("img", { src: p.src, alt: p.alt }),
}));
vi.mock("next/navigation", () => ({
  redirect: (u: string) => { throw new Error("REDIRECT " + u); },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set() {}, delete() {} }),
  headers: async () => new Headers(),
}));

const VERSION = {
  id: 1, codigo: "2026-10", titulo: "CONSENTIMIENTO DE PRUEBA – CENTRO DEPORTIVO ALEJANDRO FALLA",
  texto: "Párrafo uno.\n\nAfiliado a la EPS {{EPS}}.", texto_sha256: "x".repeat(64),
  vigente_desde: "2026-10-01", vigente_hasta: null, creado_por: null, created_at: "",
};
let vigente: typeof VERSION | null = null;
vi.mock("@/lib/registro/version", async (orig) => {
  const real = await orig<typeof import("../src/lib/registro/version")>();
  return { ...real, versionVigente: async () => vigente, registroAbierto: async () => vigente };
});
let sesion: any = null;
vi.mock("@/lib/registro/sesion", () => ({
  leerSesion: async () => sesion,
  crearSesion: async () => "s",
  anotarEnSesion: async () => {},
  cerrarSesion: async () => {},
}));

const render = async (fn: any, props: any = { searchParams: Promise.resolve({}) }) => renderToStaticMarkup(await fn(props));
const texto = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("registro público · puerta cerrada", () => {
  it("sin versión vigente, la landing, el consentimiento y datos dicen 'En preparación'", async () => {
    vigente = null;
    for (const ruta of ["../src/app/registro/page", "../src/app/registro/consentimiento/page", "../src/app/registro/datos/page"]) {
      const { default: Page } = await import(ruta);
      expect(texto(await render(Page)), ruta).toContain("Estamos preparando el registro");
    }
  });
});

describe("registro público · puerta abierta", () => {
  it("la landing ofrece los dos caminos (R1)", async () => {
    vigente = VERSION;
    const { default: Page } = await import("../src/app/registro/page");
    const html = await render(Page);
    expect(html).toContain('href="/registro/datos"');
    expect(html).toContain('href="/registro/consentimiento"');
    expect(html).toContain("registro-hero.jpg"); // la foto de la landing (diseño A)
    expect(texto(html)).toContain("Firmar el consentimiento");
    // El consentimiento es solo para menores de edad (club, 2-oct-2026); la tarjeta lo dice.
    expect(texto(html)).toContain("Solo menores de edad");
    expect(texto(html)).not.toContain("Al final firmas el consentimiento");
  });

  it("la página 'listo' para un adulto (datos sin firma) solo ofrece volver al inicio", async () => {
    sesion = { id: "s", firmante: { nombre: "Ana Pérez", documento: "1" }, miembros: [{ miembro_id: 1, cliente_id: 1, nombre: "Ana Pérez", firmado: false, datos: { fechaNacimiento: "1990-05-05" } }] };
    try {
      const { default: Page } = await import("../src/app/registro/listo/page");
      const html = await render(Page);
      expect(texto(html)).toContain("Volver al inicio");
      expect(texto(html)).toContain("Tus datos quedaron guardados");
      expect(html).not.toContain('href="/registro/consentimiento"');
      expect(texto(html)).not.toContain("Registrar otro hijo");
    } finally { sesion = null; }
  });

  it("el consentimiento muestra el texto completo, la casilla de aprobación y el campo de la firma", async () => {
    vigente = VERSION;
    const { default: Page } = await import("../src/app/registro/consentimiento/page");
    const html = await render(Page);
    const t = texto(html);
    expect(t).toContain("CONSENTIMIENTO DE PRUEBA");
    expect(t).toContain("Párrafo uno.");
    expect(html).toContain('name="acepto"');
    expect(html).toContain('name="firmaPng"');
    expect(html).toContain('name="sitio_web"'); // honeypot
    expect(html).toContain('name="eps"');
    // Diseño C "Resumen primero": resumen, el texto completo por partes y el tema claro para el layout.
    expect(t).toContain("En resumen");
    expect(t).toContain("El documento completo");
    expect(html).toContain('data-tema="claro"');
    // El botón arranca deshabilitado: sin firma válida no se envía.
    expect(html).toMatch(/Firmar el consentimiento<\/button>/);
    expect(html).toMatch(/disabled=""[^>]*>Firmar el consentimiento|<button[^>]*disabled=""[^>]*>[^<]*Firmar/);
  });

  it("el layout público no trae menú ni encabezado de la app", async () => {
    const { default: Layout } = await import("../src/app/registro/layout");
    const html = renderToStaticMarkup(<Layout><p>contenido</p></Layout>);
    expect(html).toContain("Centro Deportivo Alejandro Falla");
    expect(html).not.toContain("Dashboard");
    expect(html).not.toContain("Cerrar sesión");
  });

  it("la página 'listo' ofrece firmar por otro hijo y terminar (R9)", async () => {
    const { default: Page } = await import("../src/app/registro/listo/page");
    const html = await render(Page);
    expect(html).toContain('href="/registro/consentimiento"');
    expect(texto(html)).toContain("No, gracias");
  });

  it("el formulario de datos trae la ficha unificada completa y la casilla de tratamiento de datos (D9)", async () => {
    vigente = VERSION;
    const { default: Page } = await import("../src/app/registro/datos/page");
    const html = await render(Page);
    for (const n of ["nombres", "apellidos", "documento", "fechaNacimiento", "lugarNacimiento", "eps", "rh", "direccion", "emergenciaNombre", "acepto_datos", "sitio_web"]) {
      expect(html, n).toContain(`name="${n}"`);
    }
    expect(texto(html)).toContain("Ley 1581 de 2012");
    // Diseño A "Paso a paso": barra de pasos, el primero abierto con "Continuar" (el botón de
    // guardar solo aparece en el último paso) y los demás pasos montados pero ocultos.
    expect(texto(html)).toContain("Paso 1 de 4");
    expect(texto(html)).toContain("Continuar");
    expect(html).toContain('data-paso="facturacion" hidden=""');
    expect(html).toContain('name="facturaDe"');
    expect(texto(html)).toContain("¿A nombre de qué persona o empresa debe el centro deportivo emitir las facturas?");
  });

  it("FirmaPad se monta suelto con sus dos campos ocultos", async () => {
    const { FirmaPad } = await import("../src/app/registro/consentimiento/firma-pad");
    const html = renderToStaticMarkup(<FirmaPad nombreSugerido="Mamá Prueba" />);
    expect(html).toContain('name="metodo"');
    expect(html).toContain('name="firmaPng"');
    expect(texto(html)).toContain("Dibujar mi firma");
    expect(texto(html)).toContain("Escribir mi nombre");
  });
});

/**
 * La bandeja de revisión (Fase 3) se monta con el guardia simulado y service_role,
 * como las demás pruebas de render de pantallas con sesión. Siembra un cambio de
 * facturación pendiente sobre una ficha de prueba y lo borra en `finally`.
 */
describe("bandeja de registros", () => {
  it("lista un cambio de facturación pendiente con sus botones y el historial", async () => {
    vi.doMock("@/lib/auth", () => ({
      requireRole: async () => ({ id: "", role: "superadmin", nombre: "test", activo: true }),
      requireProfile: async () => ({ id: "", role: "superadmin", nombre: "test", activo: true }),
      getProfile: async () => ({ id: "", role: "superadmin", nombre: "test", activo: true }),
    }));
    const { createClient: sb } = await import("@supabase/supabase-js");
    const admin = sb(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    vi.doMock("@/lib/supabase/server", () => ({ createClient: async () => admin, createAdminClient: () => admin }));

    const { data: cli } = await admin.from("clientes").select("id, nombres, apellidos").order("id").limit(1).single();
    const { data: sol } = await admin.from("registro_solicitud").insert({ tipo: "datos", estado: "en_revision", cliente_id: cli!.id, payload: {} }).select("id").single();
    const { data: cambio } = await admin.from("registro_cambio").insert({ solicitud_id: sol!.id, cliente_id: cli!.id, campo: "factura_a_nit", valor_actual: "1", valor_nuevo: "9990009999" }).select("id").single();
    try {
      const { default: Page } = await import("../src/app/(app)/clientes/registros/page");
      const html = await render(Page);
      const t = texto(html);
      expect(t).toContain("Facturación por aprobar");
      expect(t).toContain("9990009999");
      expect(t).toContain(`${cli!.nombres} ${cli!.apellidos}`);
      expect(t).toContain("Aprobar");
      expect(t).toContain("Historial");
    } finally {
      await admin.from("registro_cambio").delete().eq("id", cambio!.id);
      await admin.from("registro_solicitud").delete().eq("id", sol!.id);
      vi.doUnmock("@/lib/auth");
      vi.doUnmock("@/lib/supabase/server");
    }
  }, 30_000);
});
