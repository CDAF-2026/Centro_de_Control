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
vi.mock("@/lib/registro/sesion", () => ({
  leerSesion: async () => null,
  crearSesion: async () => "s",
  anotarEnSesion: async () => {},
  cerrarSesion: async () => {},
}));

const render = async (fn: any, props: any = {}) => renderToStaticMarkup(await fn(props));
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
    expect(texto(html)).toContain("Firmar el consentimiento informado");
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
    // El botón arranca deshabilitado: sin firma válida no se envía.
    expect(html).toMatch(/Firmar el consentimiento<\/button>/);
    expect(html).toMatch(/disabled=""[^>]*>Firmar el consentimiento|<button[^>]*disabled=""[^>]*>[^<]*Firmar/);
  });

  it("el layout público no trae menú ni encabezado de la app", async () => {
    const { default: Layout } = await import("../src/app/registro/layout");
    const html = renderToStaticMarkup(<Layout><p>contenido</p></Layout>);
    expect(html).toContain("Registro de deportistas");
    expect(html).not.toContain("Dashboard");
    expect(html).not.toContain("Cerrar sesión");
  });

  it("la página 'listo' ofrece firmar por otro hijo y terminar (R9)", async () => {
    const { default: Page } = await import("../src/app/registro/listo/page");
    const html = await render(Page);
    expect(html).toContain('href="/registro/consentimiento"');
    expect(texto(html)).toContain("No, gracias");
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
