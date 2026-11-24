import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createClient as sbClient } from "@supabase/supabase-js";
import { MensajeAgente } from "../src/app/(app)/agente/piezas";
import { periodoLegible } from "../src/app/(app)/agente/respuesta";
import { MascotaAgente } from "../src/app/(app)/agente/mascota";

/**
 * La pantalla del Agente IA (Fase 1, paso 3 · 24-nov-2026), renderizada de verdad
 * (mismo arnés que cafeteria-render). Con un perfil inventado: no tiene
 * conversaciones, así que la pantalla sale como "nueva".
 */

const PERFIL = { id: "00000000-0000-0000-0000-000000000000", role: "superadmin", nombre: "test", activo: true, marca_turno: false };

vi.mock("@/lib/auth", () => ({
  requireRole: async () => PERFIL,
  requireProfile: async () => PERFIL,
  getProfile: async () => PERFIL,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => admin() }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...r }: { href: unknown; children: React.ReactNode }) =>
    React.createElement("a", { href: String(href), ...r }, children),
}));
let RUTA = "/clientes";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  usePathname: () => RUTA,
  redirect: (u: string) => {
    throw new Error("REDIRECT " + u);
  },
}));
vi.mock("next/image", () => ({
  default: (p: { src: string; alt: string; width: number }) => React.createElement("img", { src: p.src, alt: p.alt, width: p.width }),
}));

const admin = () =>
  sbClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const texto = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("/agente", () => {
  it("sin conversaciones: el saludo de la mascota y la caja de pregunta, sin preguntas sugeridas", async () => {
    const { default: Page } = await import("../src/app/(app)/agente/page");
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
    const t = texto(html);
    expect(t).toContain("Agente de IA");
    expect(t).toContain("Nueva conversación");
    expect(t).toContain("Todavía no hay conversaciones.");
    expect(t).toContain("¡Hola! Soy el Agente CDAF.");
    // Laura quitó las preguntas sugeridas (24-nov-2026): ensuciaban la interfaz.
    expect(t).not.toContain("¿Por qué bajaron mis ingresos este mes?");
    expect(html).not.toContain("rounded-full border px-3");
    expect(html).toContain('aria-label="Pregunta"');
    // Nada del modelo ni del costo en la pantalla.
    expect(t).not.toMatch(/gpt|astra|luna|US\$/i);
  });

  it("una conversación que no existe (o ajena) se abre como nueva, sin errores", async () => {
    const { default: Page } = await import("../src/app/(app)/agente/page");
    for (const c of ["999999999", "abc", "-3"]) {
      const t = texto(renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ c }) })));
      expect(t).toContain("¡Hola! Soy el Agente CDAF.");
    }
  });

  it("la mascota: un botón flotante cerrado en cualquier pantalla, y nada en la del agente", () => {
    RUTA = "/clientes";
    const html = renderToStaticMarkup(<MascotaAgente />);
    expect(html).toContain('aria-label="Abrir el Agente CDAF"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('src="/agente/mascota.png"');
    // Cerrada: sin ventana de chat todavía.
    expect(html).not.toContain('role="dialog"');
    RUTA = "/agente";
    expect(renderToStaticMarkup(<MascotaAgente />)).toBe("");
  });

  it("una respuesta: markdown con tablas de la plataforma y 'Cómo lo calculé'", () => {
    const html = renderToStaticMarkup(
      <MensajeAgente
        mensaje={{
          id: 1,
          rol: "agente",
          contenido: "**La cartera bajó.**\n\n| Mes | Saldo |\n|---|---:|\n| Oct | $500.000 |\n\n- una\n- dos\n\n<script>alert(1)</script>",
          fuentes: [{ fuente: "Saldo de las facturas de Siigo", periodo: "al 2026-11-24" }, { fuente: "Fichas de clientes" }],
          created_at: "2026-11-24T13:00:00Z",
        }}
      />,
    );
    expect(html).toContain('<strong class="text-foreground font-semibold">La cartera bajó.</strong>');
    expect(html).toContain("cdaf-table-wrap");
    expect(html).toContain('class="cdaf-table tabular-nums"');
    expect(html).toMatch(/<td style="text-align:right">\$500\.000<\/td>/);
    expect(html).toContain("list-disc");
    // El modelo no puede meter HTML propio.
    expect(html).not.toContain("<script");
    expect(texto(html)).toContain("Cómo lo calculé");
    expect(texto(html)).toContain("Saldo de las facturas de Siigo · al 24 nov 2026");
    expect(texto(html)).toContain("Fichas de clientes");
  });

  it("sin fuentes no sale 'Cómo lo calculé'", () => {
    const html = renderToStaticMarkup(
      <MensajeAgente mensaje={{ id: 2, rol: "agente", contenido: "Hola", fuentes: [], created_at: "2026-11-24T13:00:00Z" }} />,
    );
    expect(html).not.toContain("Cómo lo calculé");
  });

  it("las fechas de los periodos se leen en español", () => {
    expect(periodoLegible("2026-11-01 a 2026-11-22")).toBe("1 nov 2026 a 22 nov 2026");
    expect(periodoLegible("todos")).toBe("todos");
  });
});
