import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createClient as sbClient } from "@supabase/supabase-js";

/**
 * Estas pruebas RENDERIZAN de verdad la pantalla de marcar turno.
 *
 * Por qué existen (bug del 25-ago-2026, ver MEMORIA): compilar en verde NO
 * significa que la página abra. `tsc` no ve un error de orden de declaración
 * dentro de una función, `next build` no renderiza las páginas dinámicas, y
 * pedir la URL con curl solo llega al redirect al login. Un 500 y un redirect
 * se ven igual desde fuera.
 *
 * La pantalla de estado se prueba por separado y con props, no tocando la base:
 * es un componente de cliente que recibe el estado ya resuelto, así que se
 * pueden montar sus cuatro situaciones sin inventar turnos en datos reales.
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
  default: ({ href, children, ...r }: any) =>
    React.createElement("a", { href: String(href), ...r }, children),
}));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); },
  redirect: (u: string) => { throw new Error("REDIRECT " + u); },
  useRouter: () => ({ push() {}, refresh() {}, replace() {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));
// `refresh` es de Next 16 y lo usa la acción de marcar: sin él en el mock, la
// pantalla ni siquiera se puede importar.
vi.mock("next/cache", () => ({
  refresh: () => {},
  revalidatePath: () => {},
  revalidateTag: () => {},
}));

/** Mutable a propósito: hay que renderizar con y sin el interruptor prendido. */
const PERFIL = {
  id: "00000000-0000-0000-0000-000000000000",
  role: "recepcion",
  nombre: "Camila Arboleda",
  activo: true,
  marca_turno: true,
};
const admin = () =>
  sbClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

const P = <T,>(o: T) => Promise.resolve(o);
const render = async (fn: any, props: any) => renderToStaticMarkup(await fn(props));
const texto = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("la pantalla de marcar turno se renderiza entera", () => {
  it("con el interruptor prendido y sin turno abierto", async () => {
    PERFIL.marca_turno = true;
    const { default: Page } = await import("../src/app/(app)/turnos/page");
    const t = texto(await render(Page, {}));
    expect(t).toContain("Iniciar turno");
    expect(t).toContain("Se abre la cámara");
  });

  it("a quien no registra turnos le explica por qué está vacía", async () => {
    PERFIL.marca_turno = false;
    const { default: Page } = await import("../src/app/(app)/turnos/page");
    const t = texto(await render(Page, {}));
    expect(t).toContain("no registra turnos");
    expect(t).not.toContain("Iniciar turno");
    PERFIL.marca_turno = true;
  });
});

describe("los estados de la pantalla", () => {
  const base = {
    nombre: "Camila",
    fecha: "martes 26 de agosto",
    saludo: "Buenos días",
  };

  async function pinta(props: Record<string, unknown>) {
    const { MarcarTurno } = await import("../src/app/(app)/turnos/marcar-turno");
    return texto(
      renderToStaticMarkup(
        React.createElement(MarcarTurno as any, { ...base, ...props }),
      ),
    );
  }

  it("sin turno: saluda y ofrece iniciar", async () => {
    const t = await pinta({ inicioEl: null, pausaDesde: null });
    expect(t).toContain("Buenos días");
    expect(t).toContain("Iniciar turno");
    expect(t).not.toContain("Cerrar turno");
  });

  it("en turno: ofrece cerrar y almorzar, y dice desde cuándo", async () => {
    const t = await pinta({ inicioEl: "2026-08-26T12:02:00Z", pausaDesde: null });
    expect(t).toContain("Estás");
    expect(t).toContain("en turno");
    expect(t).toContain("Cerrar turno");
    expect(t).toContain("Salgo a almorzar");
    // 12:02 UTC = 7:02 a. m. en Bogotá. Si esto falla, el desfase se rompió.
    expect(t).toContain("Entraste a las 7:02 a. m.");
  });

  it("en almuerzo: solo deja marcar el regreso, y dice por qué", async () => {
    const t = await pinta({
      inicioEl: "2026-08-26T12:02:00Z",
      pausaDesde: "2026-08-26T17:30:00Z",
    });
    expect(t).toContain("almorzando");
    expect(t).toContain("Regresé del almuerzo");
    expect(t).toContain("Saliste a las 12:30 p. m.");
    // La regla que aplica la base de datos, explicada en pantalla.
    expect(t).not.toContain("Cerrar turno");
    expect(t).toContain("Primero marca tu regreso");
  });

  it("nunca muestra el registro de horas: ese es solo del superadministrador", async () => {
    for (const props of [
      { inicioEl: null, pausaDesde: null },
      { inicioEl: "2026-08-26T12:02:00Z", pausaDesde: null },
      { inicioEl: "2026-08-26T12:02:00Z", pausaDesde: "2026-08-26T17:30:00Z" },
    ]) {
      const t = await pinta(props);
      for (const prohibido of [
        "Esta semana",
        "Últimos turnos",
        "Cómo va el día",
        "de 42 h",
        "horas trabajadas",
        "Diurnas",
        "Nocturnas",
        "Extras",
      ]) {
        expect(t, `no debería decir "${prohibido}"`).not.toContain(prohibido);
      }
    }
  });
});

describe("la cámara y sus fallos", () => {
  // Estas dos vistas solo se alcanzan tocando un botón, así que se sacaron a
  // componentes propios: sin eso, un error aquí no lo vería nada hasta que
  // alguien fuera a marcar de verdad.
  it("el visor se pinta para entrada y para salida", async () => {
    const { VistaCamara } = await import("../src/app/(app)/turnos/marcar-turno");
    for (const accion of ["entrada", "salida"] as const) {
      const html = renderToStaticMarkup(
        React.createElement(VistaCamara as any, {
          accion,
          enviando: false,
          videoRef: { current: null },
          onCancelar() {},
          onCapturar() {},
        }),
      );
      expect(texto(html)).toContain(`Foto de ${accion}`);
      expect(texto(html)).toContain("Centra tu cara en el óvalo");
      expect(html).toContain("<video");
    }
  });

  it("cada fallo de cámara se explica distinto", async () => {
    const { VistaFallo } = await import("../src/app/(app)/turnos/marcar-turno");
    const esperado: Record<string, string> = {
      bloqueada: "está bloqueada",
      sin_camara: "No encontramos la cámara",
      ocupada: "está ocupada",
      insegura: "conexiones seguras",
      otro: "No se pudo abrir la cámara",
    };
    for (const [fallo, frase] of Object.entries(esperado)) {
      const t = texto(
        renderToStaticMarkup(
          React.createElement(VistaFallo as any, { fallo, onReintentar() {} }),
        ),
      );
      expect(t, fallo).toContain(frase);
      expect(t, fallo).toContain("Volver a intentar");
      // La salida de emergencia: el PC de recepción.
      expect(t, fallo).toContain("computador de recepción");
    }
  });

  it("solo el bloqueo por permiso muestra los pasos para desbloquearla", async () => {
    const { VistaFallo } = await import("../src/app/(app)/turnos/marcar-turno");
    const pinta = (fallo: string) =>
      texto(renderToStaticMarkup(React.createElement(VistaFallo as any, { fallo, onReintentar() {} })));
    expect(pinta("bloqueada")).toContain("candado de la barra de direcciones");
    expect(pinta("sin_camara")).not.toContain("candado de la barra de direcciones");
  });
});

describe("el interruptor y el PIN en la ficha del empleado", () => {
  it("el superadministrador ve la tarjeta de registro de horas", async () => {
    PERFIL.role = "superadmin";
    const { data } = await sbClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    ).from("profiles").select("id").eq("marca_turno", true).limit(1);
    const empleadoId = data?.[0]?.id as string;
    expect(empleadoId).toBeTruthy();

    const { default: Page } = await import("../src/app/(app)/empleados/[id]/page");
    const t = texto(await render(Page, { params: P({ id: empleadoId }) }));

    expect(t).toContain("Registro de horas");
    expect(t).toContain("Registra turnos");
    expect(t).toContain("Sí marca");
    // Con el interruptor prendido aparece el PIN del PC de recepción.
    expect(t).toContain("PIN del computador de recepción");
    PERFIL.role = "recepcion";
  });

  it("quien no es superadministrador no la ve", async () => {
    PERFIL.role = "coord_admin";
    const { data } = await sbClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    ).from("profiles").select("id").eq("marca_turno", true).limit(1);

    const { default: Page } = await import("../src/app/(app)/empleados/[id]/page");
    const t = texto(await render(Page, { params: P({ id: data![0].id }) }));

    expect(t).not.toContain("Registro de horas");
    expect(t).not.toContain("PIN del computador");
    PERFIL.role = "recepcion";
  });
});
