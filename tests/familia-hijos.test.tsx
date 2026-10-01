import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * "Agregar hijo" en la ficha de un adulto (1-oct-2026). La tarjeta de familia solo
 * salía en fichas de menores, así que a la ficha de una mamá sola no había forma de
 * agregarle su hija (caso Alejandra Vila / Alanna Mondragón). Ahora sale siempre a
 * quien edita clientes, y dice "hijo" si la titular es adulta y "hermano" si es un niño.
 */

vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("../src/app/(app)/clientes/actions", () => ({
  agregarHermano: async () => ({}),
  editarHermano: async () => ({}),
  quitarHermano: async () => {},
}));

const texto = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const mama = {
  id: 1,
  nombres: "Alejandra",
  apellidos: "Prueba",
  fecha_nacimiento: null,
  documento: null,
  tipo_documento: null,
  eps: null,
  rh: null,
  lugar_nacimiento: null,
  deportes: [],
  es_titular: true,
};

describe("miembros de la familia", () => {
  it("en la ficha de un adulto ofrece Agregar hijo", async () => {
    const { Hermanos } = await import("../src/app/(app)/clientes/[id]/hermanos");
    const html = texto(
      renderToStaticMarkup(
        React.createElement(Hermanos, { clienteId: 1, miembros: [mama], puedeEditar: true, parentesco: "hijo" }),
      ),
    );
    expect(html).toContain("Agregar hijo");
    expect(html).not.toContain("hermano");
  });

  it("en la ficha de un niño sigue diciendo Agregar hermano", async () => {
    const { Hermanos } = await import("../src/app/(app)/clientes/[id]/hermanos");
    const html = texto(
      renderToStaticMarkup(
        React.createElement(Hermanos, {
          clienteId: 1,
          miembros: [{ ...mama, nombres: "Niña" }],
          puedeEditar: true,
          parentesco: "hermano",
        }),
      ),
    );
    expect(html).toContain("Agregar hermano");
  });

  it("sin permiso de editar no ofrece agregar", async () => {
    const { Hermanos } = await import("../src/app/(app)/clientes/[id]/hermanos");
    const html = texto(
      renderToStaticMarkup(
        React.createElement(Hermanos, { clienteId: 1, miembros: [mama], puedeEditar: false, parentesco: "hijo" }),
      ),
    );
    expect(html).not.toContain("Agregar");
  });
});
