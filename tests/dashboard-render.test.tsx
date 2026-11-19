import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createClient as sbClient } from "@supabase/supabase-js";
import {
  M,
  P,
  corto,
  ejeM,
  abrev,
  esc,
  variacion,
  coloresDe,
  colorDeServicio,
  tintaSobre,
  turnoDeColor,
  distancia,
  sinVecinosParecidos,
} from "@/app/(app)/dashboard/tablero-formato";

/**
 * Render del DASHBOARD del superadministrador (rediseño de nov-2026, gráficas con ECharts).
 *
 * Mismo motivo que las demás pruebas de render: ni `tsc` ni `next build` ejecutan una
 * página dinámica, así que un error de ejecución solo aparece al renderizarla de verdad.
 * El dashboard no tenía red hasta este rediseño.
 *
 * No comprueba cifras (cambian a diario): comprueba que la pantalla se ejecute entera en
 * cada periodo y que los datos que les llegan a las gráficas tengan la forma que esperan.
 * Las gráficas en sí no se pueden probar aquí: ECharts dibuja en un lienzo, en el
 * navegador; en el servidor cada una es solo una caja vacía.
 *
 * ⚠️ Usa service_role (se prueba el RENDER, no los permisos) y llama a EasyCancha de
 * verdad, por eso el tope de tiempo es más largo que el del resto.
 */

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
  usePathname: () => "/dashboard",
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {}, refresh: () => {} }));

const admin = () =>
  sbClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

const texto = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const TOPE = 60_000;

/** Los elementos de un tipo dentro del árbol que devuelve la pantalla (sin renderizarlos). */
function buscar(nodo: any, tipo: unknown, out: any[] = []): any[] {
  if (Array.isArray(nodo)) nodo.forEach((n) => buscar(n, tipo, out));
  else if (nodo && typeof nodo === "object" && "props" in nodo) {
    if (nodo.type === tipo) out.push(nodo);
    for (const v of Object.values(nodo.props ?? {})) buscar(v, tipo, out);
  }
  return out;
}

// En el orden en que aparecen en pantalla (decidido por Laura, 19-nov-2026).
const PANELES = [
  "Así va el marcador de hoy",
  "Facturado",
  "Cobrado",
  "Por cobrar del periodo",
  "Cartera total",
  "Cobrado por día",
  "Facturado:",
  "Ingreso por servicio",
  "Los últimos 7 días",
  "Top clientes",
  "Top deudores",
  "El reloj de las canchas",
  "Clases por entrenador",
];

describe("Dashboard del superadministrador", () => {
  it.each(["mes", "semana", "3m"] as const)(
    "se ejecuta entero en el periodo «%s» y pinta todos los bloques, en orden",
    async (periodo) => {
      const { SuperadminDashboard } = await import("@/app/(app)/dashboard/superadmin-dashboard");
      const html = texto(renderToStaticMarkup(await SuperadminDashboard({ periodo, nombre: "prueba", ahora: new Date() })));
      let desde = 0;
      for (const p of PANELES) {
        const i = html.indexOf(p, desde);
        expect(i, `falta «${p}» o está fuera de orden`).toBeGreaterThanOrEqual(0);
        desde = i + p.length;
      }
      expect(html).toContain("Hola, prueba");
    },
    TOPE,
  );

  it(
    "se ejecuta con un rango personalizado ya cerrado",
    async () => {
      const { SuperadminDashboard } = await import("@/app/(app)/dashboard/superadmin-dashboard");
      const html = texto(
        renderToStaticMarkup(
          await SuperadminDashboard({ periodo: "custom", desde: "2026-09-01", hasta: "2026-09-30", nombre: "prueba", ahora: new Date() }),
        ),
      );
      for (const p of PANELES) expect(html).toContain(p);
      // Fuera de "mes" los dos lados no tienen nombre de mes.
      expect(html).toContain("Facturado: este periodo vs. el anterior");
    },
    TOPE,
  );

  it(
    "les pasa a las gráficas datos con la forma que esperan",
    async () => {
      const { SuperadminDashboard } = await import("@/app/(app)/dashboard/superadmin-dashboard");
      const paneles = await import("@/app/(app)/dashboard/tablero-paneles");
      const arbol = await SuperadminDashboard({ periodo: "mes", nombre: "prueba", ahora: new Date() });

      const cobro = buscar(arbol, paneles.PanelCobro)[0].props.serie;
      expect(cobro.etiquetas.length).toBeGreaterThan(0);
      expect(cobro.titulos).toHaveLength(cobro.etiquetas.length);
      expect(cobro.montos).toHaveLength(cobro.etiquetas.length);

      const comp = buscar(arbol, paneles.PanelComparativo)[0].props;
      expect(comp.actual.acum.length).toBeGreaterThan(0);
      expect(comp.previo.acum.length).toBeGreaterThan(0);
      // Una fecha por día: de ahí sale la nota del salto más grande.
      expect(comp.actual.marcas).toHaveLength(comp.actual.acum.length);
      // Acumulado: nunca baja de un día al siguiente (salvo el hueco de "hoy sin datos").
      const llenos = comp.previo.acum.filter((v: number | null) => v != null) as number[];
      for (let i = 1; i < llenos.length; i++) expect(llenos[i]).toBeGreaterThanOrEqual(llenos[i - 1] - 1);
      // La cifra grande es el final de la curva: si no, la tarjeta diría dos totales distintos.
      const curva = comp.actual.acum.filter((v: number | null) => v != null) as number[];
      if (curva.length === comp.actual.acum.length) expect(Math.round(comp.total)).toBe(Math.round(curva[curva.length - 1]));
      expect(comp.titulo).toMatch(/^Facturado: \S+ vs\. \S+$/);

      // Los indicadores de arriba llevan su minigráfica.
      expect(buscar(arbol, paneles.Chispa)).toHaveLength(2);

      const semana = buscar(arbol, paneles.PanelSemana)[0].props.dias;
      expect(semana).toHaveLength(7);

      const servicios = buscar(arbol, paneles.PanelServicios)[0].props;
      const montos = servicios.servicios.map((s: { actual: number }) => s.actual);
      expect(montos.every((v: number) => v > 0)).toBe(true);
      expect([...montos].sort((a, b) => b - a)).toEqual(montos); // de mayor a menor
      expect(Math.round(servicios.total)).toBe(Math.round(montos.reduce((s: number, v: number) => s + v, 0)));
      // El color es propio (un hex) o ninguno: nunca un texto vacío que ECharts pinte en negro.
      for (const s of servicios.servicios) expect(s.color === null || /^#[0-9a-f]{6}$/.test(s.color)).toBe(true);
      expect(servicios.suben.length).toBeLessThanOrEqual(3);
      expect(servicios.bajan.length).toBeLessThanOrEqual(3);
      expect(servicios.frente).toMatch(/^Frente a /);

      const reloj = buscar(arbol, paneles.PanelReloj)[0].props.reloj;
      expect(reloj.horas).toHaveLength(14); // 7 a. m. a 9 p. m.
      for (const dep of [reloj.tenis, reloj.padel]) {
        expect(dep).toHaveLength(14);
        expect(dep.every((v: number) => Number.isInteger(v) && v >= 0 && v <= 100)).toBe(true);
      }
    },
    TOPE,
  );
});

describe("Dashboard · formatos y colores", () => {
  it("dinero: millones con coma, pesos con puntos", () => {
    expect(M(113883917)).toBe("$113,9 M"); // espacio duro: la etiqueta no se parte en dos líneas
    expect(P(113883917)).toBe("$113.883.917");
    expect(P(-520000)).toBe("−$520.000");
    expect(corto(200000)).toBe("$200.000"); // bajo un millón, la cifra completa
    expect(corto(53041446)).toBe("$53,0 M");
  });
  it("marcas del eje", () => {
    expect(ejeM(0)).toBe("$0");
    expect(ejeM(12e6)).toBe("$12 M");
    expect(ejeM(2.5e6)).toBe("$2,5 M");
    expect(ejeM(500000)).toBe("$500 mil");
  });
  it("variación frente al periodo anterior", () => {
    expect(variacion(113883917, 152682466)).toEqual({ texto: "−25%", signo: -1 });
    expect(variacion(172927363, 153202466)).toEqual({ texto: "+13%", signo: 1 });
    expect(variacion(172927363, 153202466, 1)).toEqual({ texto: "+12,9%", signo: 1 }); // la cifra grande
    expect(variacion(7020000, 7020000)).toEqual({ texto: "igual", signo: 0 });
    expect(variacion(200000, 0)).toEqual({ texto: "nuevo", signo: 1 });
  });
  it("las dos academias recreativas no quedan con el mismo nombre al abreviar", () => {
    expect(abrev("Academia Recreativa Tenis")).toBe("Acad. Rec. Tenis");
    expect(abrev("Academia Recreativa Pádel")).toBe("Acad. Rec. Pádel");
    expect(abrev("Academia Competencia Tenis")).toBe("Acad. Comp. Tenis");
  });
  it("un nombre con etiquetas no se cuela como HTML en un tooltip", () => {
    expect(esc('<img src=x onerror="a">')).toBe("&lt;img src=x onerror=&quot;a&quot;&gt;");
  });
  it("cada servicio tiene su color por clave; el que no está en la lista no tiene", () => {
    expect(colorDeServicio("patrocinio")).toBe("#6250d6");
    expect(colorDeServicio("clases_padel")).toBe("#e34948");
    expect(colorDeServicio("vacacionales")).toBeNull();
    expect(colorDeServicio(null)).toBeNull();
    expect(colorDeServicio(undefined)).toBeNull();
  });
  it("colores de una gráfica: el propio si lo tiene; si no, uno libre y nunca repetido", () => {
    const propios = ["#6250d6", "#1baf7a", "#eda100", "#2a78d6", "#eb6834"];
    expect(coloresDe(propios)).toEqual(propios);
    const mezcla = coloresDe(["#6250d6", null, null, "#2a78d6", null]); // tres sin color propio
    expect(new Set(mezcla).size).toBe(5);
    expect(mezcla[0]).toBe("#6250d6");
    expect(mezcla[3]).toBe("#2a78d6");
  });
  it("al apilar, naranja y rojo no quedan pegados", () => {
    // Cafetería (naranja) y Clases de pádel (rojo) se confunden si van una sobre la otra.
    expect(Math.abs(turnoDeColor("#eb6834") - turnoDeColor("#e34948"))).toBeGreaterThan(1);
  });
  it("en la dona, naranja y rojo no quedan de vecinos aunque les toque por tamaño", () => {
    // El caso real de la semana del 13 al 19 de nov: Clases de pádel (rojo) y Cafetería
    // (naranja) quedaban 4ª y 5ª, una junto a la otra.
    expect(distancia("#eb6834", "#e34948")).toBeLessThan(15);
    const porTamano = ["#2a78d6", "#eda100", "#1baf7a", "#e34948", "#eb6834"].map((color) => ({ color }));
    const anillo = sinVecinosParecidos(porTamano).map((x) => x.color);
    expect([...anillo].sort()).toEqual(porTamano.map((x) => x.color).sort()); // no pierde ni repite ninguno
    for (let i = 1; i < anillo.length; i++) expect(distancia(anillo[i], anillo[i - 1])).toBeGreaterThanOrEqual(15);
    // Y cuando no hay nada que separar, respeta el orden por tamaño (el mes de nov-2026).
    const mes = ["#6250d6", "#1baf7a", "#eda100", "#2a78d6", "#eb6834"].map((color) => ({ color }));
    expect(sinVecinosParecidos(mes)).toEqual(mes);
  });
  it("la tinta de un bloque se escoge por lo claro que es su color", () => {
    expect(tintaSobre("#eda100")).toBe("#16181a"); // amarillo: tinta oscura
    expect(tintaSobre("#184f95")).toBe("#ffffff"); // azul oscuro: tinta blanca
  });
});
