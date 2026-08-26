import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createClient as sbClient } from "@supabase/supabase-js";

/**
 * La pantalla del quiósco, renderizada de verdad.
 *
 * Casi todo se prueba montando las piezas con props, y no la página: cada paso
 * del recorrido (elegir acción, teclear el PIN, la cámara, el listo) solo se
 * alcanza tocando, así que sin sacarlas a componentes propios un error ahí no lo
 * vería nada hasta que alguien fuera a marcar. Es la misma lección de
 * `VistaCamara` en la pantalla del celular.
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
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); },
  redirect: (u: string) => { throw new Error("REDIRECT " + u); },
  useRouter: () => ({ push() {}, refresh() {}, replace() {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/quiosco",
}));
vi.mock("next/cache", () => ({
  refresh: () => {},
  revalidatePath: () => {},
  revalidateTag: () => {},
}));

const PERFIL = {
  id: "00000000-0000-0000-0000-000000000000",
  role: "quiosco",
  nombre: "Quiósco",
  activo: true,
  marca_turno: false,
};
const admin = () =>
  sbClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

const texto = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const pinta = (c: any, props: any) => renderToStaticMarkup(React.createElement(c, props));

const SIN_TURNO = {
  perfil_id: "p1",
  nombre: "Camila Arboleda",
  turno_id: null,
  inicio_el: null,
  pausa_abierta: false,
  tiene_pin: true,
};
const EN_TURNO = {
  perfil_id: "p2",
  nombre: "Juan Fernando Gaviria",
  turno_id: 10,
  inicio_el: "2026-08-26T12:02:00Z",
  pausa_abierta: false,
  tiene_pin: true,
};
const ALMORZANDO = {
  perfil_id: "p3",
  nombre: "Santiago Montoya",
  turno_id: 11,
  inicio_el: "2026-08-26T12:00:00Z",
  pausa_abierta: true,
  tiene_pin: true,
};
const SIN_PIN = { ...SIN_TURNO, perfil_id: "p4", nombre: "Carlos Restrepo", tiene_pin: false };

describe("la lista del quiósco", () => {
  it("muestra a cada quien con su estado", async () => {
    const { Quiosco } = await import("../src/app/quiosco/quiosco");
    const t = texto(
      pinta(Quiosco, { gente: [SIN_TURNO, EN_TURNO, ALMORZANDO], fecha: "miércoles 26 de agosto" }),
    );
    expect(t).toContain("Marcar turno");
    expect(t).toContain("Camila");
    expect(t).toContain("Sin turno");
    // 12:02 UTC = 7:02 a. m. en Bogotá.
    expect(t).toContain("Desde 7:02 a. m.");
    expect(t).toContain("Almorzando");
    expect(t).toContain("Toca tu nombre para marcar");
  });

  it("a quien no tiene PIN lo deja inhabilitado y le dice qué hacer", async () => {
    const { Tarjeta } = await import("../src/app/quiosco/quiosco");
    const html = pinta(Tarjeta, { persona: SIN_PIN, onElegir() {} });
    expect(html).toContain("disabled");
    expect(texto(html)).toContain("marca desde tu celular");
  });

  it("sin nadie con turnos activados lo dice, no sale en blanco", async () => {
    const { Quiosco } = await import("../src/app/quiosco/quiosco");
    const t = texto(pinta(Quiosco, { gente: [], fecha: "miércoles 26 de agosto" }));
    expect(t).toContain("Nadie tiene el registro de turnos activado");
  });

  it("el reloj no se pinta en el servidor: se llenaría con otro segundo", async () => {
    // Si el servidor pintara la hora, el navegador la reemplazaría al hidratar
    // con un valor distinto y React descartaría el árbol entero.
    const { Quiosco } = await import("../src/app/quiosco/quiosco");
    const t = texto(pinta(Quiosco, { gente: [EN_TURNO], fecha: "miércoles 26 de agosto" }));
    expect(t).not.toMatch(/\d{1,2}:\d{2}\s(a|p)\.\sm\.\s*$/);
  });
});

describe("los pasos de la marcación", () => {
  it("en turno ofrece cerrar y almorzar; en almuerzo, solo regresar", async () => {
    const { VistaAcciones } = await import("../src/app/quiosco/quiosco");

    const enTurno = texto(pinta(VistaAcciones, { persona: EN_TURNO, onElegir() {} }));
    expect(enTurno).toContain("Cerrar turno");
    expect(enTurno).toContain("Salgo a almorzar");
    expect(enTurno).toContain("En turno desde las 7:02 a. m.");

    const almorzando = texto(pinta(VistaAcciones, { persona: ALMORZANDO, onElegir() {} }));
    expect(almorzando).toContain("Regresé del almuerzo");
    expect(almorzando).not.toContain("Cerrar turno");
  });

  it("el PIN se teclea en pantalla y muestra un punto por dígito", async () => {
    const { VistaPin } = await import("../src/app/quiosco/quiosco");
    const html = pinta(VistaPin, {
      nombre: "Juan",
      rotulo: "Cerrar turno",
      pin: "12",
      error: "",
      enviando: false,
      onDigito() {},
      onBorrar() {},
    });
    const t = texto(html);
    expect(t).toContain("Juan, escribe tu PIN");
    expect(t).toContain("Cerrar turno");
    // Diez teclas más la de borrar.
    expect((html.match(/<button/g) ?? []).length).toBe(11);
    // Dos puntos llenos de cuatro.
    expect((html.match(/bg-primary"/g) ?? []).length).toBe(2);
  });

  it("el PIN equivocado se dice en pantalla, sin sacar a la persona del paso", async () => {
    const { VistaPin } = await import("../src/app/quiosco/quiosco");
    const t = texto(
      pinta(VistaPin, {
        nombre: "Juan",
        rotulo: "Cerrar turno",
        pin: "",
        error: "PIN incorrecto. Te quedan 3 intentos.",
        enviando: false,
        onDigito() {},
        onBorrar() {},
      }),
    );
    expect(t).toContain("Te quedan 3 intentos");
  });

  it("la cámara se pinta con su visor y su botón", async () => {
    const { VistaCamaraQuiosco } = await import("../src/app/quiosco/quiosco");
    const html = pinta(VistaCamaraQuiosco, {
      accion: "salida",
      enviando: false,
      videoRef: { current: null },
      onCapturar() {},
    });
    expect(html).toContain("<video");
    const t = texto(html);
    expect(t).toContain("Mira a la cámara");
    expect(t).toContain("hora de salida queda registrada");
    expect(t).toContain("Tomar la foto");
  });

  it("el listo dice la HORA que quedó, no solo «listo»", async () => {
    const { VistaListo } = await import("../src/app/quiosco/quiosco");
    const t = texto(
      pinta(VistaListo, { nombre: "Juan", mensaje: "Salida registrada a las 2:47 p. m." }),
    );
    expect(t).toContain("Listo, Juan");
    expect(t).toContain("Salida registrada a las 2:47 p. m.");
  });
});

describe("la página", () => {
  it("se renderiza entera", async () => {
    // ⚠️ Con service_role, `quiosco_estado` lanza excepción porque
    // `private.user_role()` es null; supabase-js la devuelve como error y la
    // página pinta la lista vacía. Es del arnés, no de la app — lo que se
    // comprueba aquí es que la página se ejecuta de principio a fin.
    const { default: Page } = await import("../src/app/quiosco/page");
    const t = texto(renderToStaticMarkup(await Page()));
    expect(t).toContain("Marcar turno");
    expect(t).toContain("Centro Deportivo Alejandro Falla");
  });
});
