import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * El precio del paquete es de CADA CLIENTE, no del catálogo (30-sep-2026).
 * Estas pruebas fijan las decisiones de Laura para que nadie las deshaga sin
 * querer: el catálogo no pide precio, la asignación sí (vacío y obligatorio),
 * y un precio en cero no pasa.
 */

vi.mock("next/link", () => ({
  default: ({ href, children, ...r }: { href: unknown; children?: React.ReactNode }) =>
    React.createElement("a", { href: String(href), ...r }, children),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("../src/app/(app)/clientes/actions", () => ({
  asignarPaquete: async () => ({}),
  editarPaqueteCliente: async () => ({}),
  anularPaqueteCliente: async () => ({}),
}));
vi.mock("../src/app/(app)/paquetes/actions", () => ({
  createCatalogo: async () => ({}),
  updateCatalogo: async () => ({}),
  deleteCatalogo: async () => ({}),
}));

const texto = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("precio del paquete por cliente", () => {
  it("la validación rechaza vacío y cero, y acepta un precio real", async () => {
    const { precioAsignacionSchema } = await import("../src/lib/validations/paquete");
    expect(precioAsignacionSchema.safeParse("").success).toBe(false);
    expect(precioAsignacionSchema.safeParse(null).success).toBe(false);
    expect(precioAsignacionSchema.safeParse("0").success).toBe(false);
    expect(precioAsignacionSchema.safeParse("-5").success).toBe(false);
    const ok = precioAsignacionSchema.safeParse("880000");
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data).toBe(880000);
  });

  it("el catálogo ya no pide precio ni descuento", async () => {
    const { createCatalogoSchema } = await import("../src/lib/validations/paquete");
    expect(Object.keys(createCatalogoSchema.shape)).not.toContain("precio");
    expect(Object.keys(createCatalogoSchema.shape)).not.toContain("descuento");

    const { CatalogoForm } = await import("../src/app/(app)/paquetes/catalogo-form");
    const form = renderToStaticMarkup(React.createElement(CatalogoForm));
    expect(form).not.toContain('name="precio"');
    expect(form).not.toContain('name="descuento"');

    const { CatalogoCard } = await import("../src/app/(app)/paquetes/catalogo-card");
    const card = renderToStaticMarkup(
      React.createElement(CatalogoCard, {
        paquete: { id: 8, nombre: "Pádel 8 clases · 1 persona", deporte: "padel", num_clases: 8, activo: true },
        puedeConfig: true,
      }),
    );
    expect(texto(card)).toContain("Pádel 8 clases · 1 persona");
    expect(card).not.toContain("$");
    // La tarjeta lee las personas del nombre y las muestra como dato.
    expect(texto(card)).toMatch(/1\s+persona\b/);
  });

  it("la ficha pide el precio al asignar (vacío, obligatorio) y muestra el de cada paquete", async () => {
    const { ServiciosCliente } = await import("../src/app/(app)/clientes/[id]/servicios-cliente");
    const html = renderToStaticMarkup(
      React.createElement(ServiciosCliente, {
        clienteId: 1,
        inscripciones: [],
        paquetes: [
          { id: 22, num_clases: 8, clases_consumidas: 3, estado: "activo", precio: 880000, nombre: "Pádel 8 clases · 1 persona", inicia: "2026-09-01", vence: null, miembro: null },
          { id: 23, num_clases: 8, clases_consumidas: 0, estado: "activo", precio: 0, nombre: "Pádel 8 clases · 2 personas", inicia: "2026-09-01", vence: null, miembro: null },
        ],
        catalogo: [
          { id: 8, nombre: "Pádel 8 clases · 1 persona", num_clases: 8 },
          { id: 99, nombre: "Bono especial", num_clases: 4 },
        ],
        puedeEditar: true,
        esSuperadmin: true,
      }),
    );
    const t = texto(html);
    // Asignar: campo de precio obligatorio, sin valor precargado, sin descuento.
    const inputPrecio = html.match(/<input[^>]*name="precio"[^>]*>/g) ?? [];
    expect(inputPrecio).toHaveLength(1);
    expect(inputPrecio[0]).toContain("required");
    expect(inputPrecio[0]).not.toContain("value=");
    expect(html).not.toContain('name="descuento"');
    // Cada paquete muestra lo que ese cliente paga; el que quedó en 0 se marca.
    expect(t).toContain("880.000");
    expect(t).toContain("Sin precio");
    // El selector no repite "(8 clases)" si el nombre ya lo dice, y lo agrega si no.
    expect(t).toContain("Pádel 8 clases · 1 persona");
    expect(t).not.toContain("Pádel 8 clases · 1 persona (8 clases)");
    expect(t).toContain("Bono especial (4 clases)");
  });
});
