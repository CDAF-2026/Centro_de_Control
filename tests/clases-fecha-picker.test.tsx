import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * El selector "Ir a" de `/clases` se prueba con props, no montando la página:
 * `/clases` sale a la API de EasyCancha, así que renderizarla entera en una
 * prueba la ataría a un servicio externo. El componente es de cliente y recibe
 * todo resuelto, de modo que aquí se comprueban las dos cosas que se pueden
 * romper en silencio: que pinte, y a DÓNDE navega desde cada vista.
 */

const rutas: string[] = [];
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: (u: string) => void rutas.push(u), refresh() {}, replace() {} }),
}));

const { FechaPicker } = await import("@/app/(app)/clases/fecha-picker");

// Dispara el onChange sin DOM: React lo guarda en las props del elemento.
const elegir = (props: React.ComponentProps<typeof FechaPicker>, fecha: string) => {
  const arbol = FechaPicker(props) as React.ReactElement<any>;
  const input = arbol.props.children.find(
    (h: any) => h && typeof h === "object" && h.props?.type === "date",
  );
  input.props.onChange({ target: { value: fecha } });
};

const base = { date: "2026-08-09", deporte: "", profesor: "", cancha: "" } as const;

beforeEach(() => void (rutas.length = 0));

describe("FechaPicker de /clases", () => {
  it("pinta el campo de fecha con el día actual", () => {
    const html = renderToStaticMarkup(<FechaPicker vista="dia" {...base} />);
    expect(html).toContain('type="date"');
    expect(html).toContain('value="2026-08-09"');
    expect(html).toContain("Ir a");
  });

  it("desde Mes abre la vista por DÍA de la fecha elegida", () => {
    elegir({ vista: "mes", ...base }, "2026-08-21");
    expect(rutas).toEqual(["/clases?vista=dia&date=2026-08-21"]);
  });

  it("desde Día conserva la vista y solo cambia el día", () => {
    elegir({ vista: "dia", ...base }, "2026-08-21");
    expect(rutas).toEqual(["/clases?vista=dia&date=2026-08-21"]);
  });

  it("conserva el profesor y el deporte al saltar de fecha", () => {
    elegir({ ...base, vista: "profesor", profesor: "Jorge Pérez", deporte: "tenis" }, "2026-08-21");
    expect(rutas).toEqual(["/clases?vista=profesor&date=2026-08-21&profesor=Jorge%20P%C3%A9rez&deporte=tenis"]);
  });

  it("conserva la cancha elegida", () => {
    elegir({ ...base, vista: "cancha", cancha: "tenis-3" }, "2026-08-21");
    expect(rutas).toEqual(["/clases?vista=cancha&date=2026-08-21&cancha=tenis-3"]);
  });

  it("ignora una fecha incompleta (el navegador emite '' mientras se teclea)", () => {
    elegir({ vista: "dia", ...base }, "");
    elegir({ vista: "dia", ...base }, "2026-8-9");
    expect(rutas).toEqual([]);
  });
});
