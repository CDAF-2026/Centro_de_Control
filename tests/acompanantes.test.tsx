import React from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { leerAcompanantes, unirAcompanantes, validarAcompanantes } from "@/lib/acompanantes";
import { AcompanantesCampos } from "@/components/acompanantes-campos";

/**
 * Acompañantes de la clase particular compartida (Laura, 3-oct-2026): la clase
 * de Simón Mosquera del 2-oct estaba para 1 persona y la tomaron 3. Al subir el
 * nº de personas se piden, obligatorios, los nombres de los otros dos.
 */
describe("validarAcompanantes", () => {
  it("con 1 persona no pide a nadie", () => {
    expect(validarAcompanantes([], 1)).toEqual({ nombres: [] });
  });

  it("con 3 personas pide 2 nombres y los capitaliza", () => {
    expect(validarAcompanantes(["ana pérez", "  JUAN DE LA ROSA "], 3)).toEqual({
      nombres: ["Ana Pérez", "Juan de la Rosa"],
    });
  });

  it("rechaza si falta un nombre", () => {
    const r = validarAcompanantes(["Ana Pérez", ""], 3);
    expect("error" in r && r.error).toContain("falta 1");
  });

  it("con 2 personas el aviso habla de 'la otra persona'", () => {
    const r = validarAcompanantes([" "], 2);
    expect("error" in r && r.error).toContain("la otra persona");
  });

  it("en el calendario con la clase pendiente no los exige y guarda los que haya", () => {
    expect(validarAcompanantes(["", "juan gil"], 3, { obligatorio: false })).toEqual({ nombres: ["Juan Gil"] });
    expect(validarAcompanantes([], 3, { obligatorio: false })).toEqual({ nombres: [] });
  });

  it("si bajó de 3 a 2, ignora el nombre sobrante", () => {
    expect(validarAcompanantes(["Ana", "Juan"], 2)).toEqual({ nombres: ["Ana"] });
  });
});

describe("guardar y leer", () => {
  it("ida y vuelta por la columna de texto", () => {
    const guardado = unirAcompanantes(["Ana Pérez", "Juan Gil"]);
    expect(guardado).toBe("Ana Pérez\nJuan Gil");
    expect(leerAcompanantes(guardado)).toEqual(["Ana Pérez", "Juan Gil"]);
  });

  it("sin nadie guarda null y lee lista vacía", () => {
    expect(unirAcompanantes([])).toBeNull();
    expect(leerAcompanantes(null)).toEqual([]);
  });
});

describe("casillas de nombres", () => {
  const pintar = (personas: number, iniciales: string[] = []) =>
    renderToStaticMarkup(React.createElement(AcompanantesCampos, { personas, iniciales }));

  it("con 1 persona no aparece nada", () => {
    expect(pintar(1)).toBe("");
  });

  it("con 3 personas aparecen 2 casillas obligatorias", () => {
    const html = pintar(3);
    expect(html.match(/name="acompanante"/g)).toHaveLength(2);
    expect(html.match(/required/g)).toHaveLength(2);
    expect(html).toContain("Persona 2");
    expect(html).toContain("Persona 3");
  });

  it("opcionales: sin 'required' y con el aviso de que los pone el profesor", () => {
    const html = renderToStaticMarkup(
      React.createElement(AcompanantesCampos, { personas: 3, iniciales: [], obligatorio: false }),
    );
    expect(html).not.toContain("required");
    expect(html).toContain("el profesor los pone al cerrar");
  });

  it("trae los nombres ya guardados", () => {
    expect(pintar(2, ["Ana Pérez"])).toContain('value="Ana Pérez"');
  });
});
