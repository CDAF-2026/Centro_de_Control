import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { opcionesParaDeporte } from "@/lib/staff";
import type { StaffDocente } from "@/lib/database.types";

/**
 * Asignar el profesor a una clase que llegó sin él desde EasyCancha.
 *
 * Por qué importa tanto: una clase con `profesor_id = null` la SALTA la
 * liquidación (`if (!c.profesor_id) continue`), así que se dictó, se cobró y no
 * se le pagó a nadie — sin un solo error por ningún lado. Al medirlo el
 * 15-sep-2026 había 12 clases así, del 7 al 14 de septiembre.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push() {}, refresh() {}, replace() {} }),
}));
vi.mock("next/cache", () => ({ refresh: () => {}, revalidatePath: () => {}, revalidateTag: () => {} }));
// La acción vive en un archivo "use server" que arrastra media app; el modal
// solo necesita que exista para pasársela a useActionState.
vi.mock("@/app/(app)/clases/actions", () => ({ asignarProfesorClase: async () => ({}) }));

const docente = (nombre: string, deportes: StaffDocente["deportes"]): StaffDocente => ({
  id: `id-${nombre}`,
  nombre,
  role: "profesor",
  activo: true,
  deportes,
});

// Los 8 docentes reales del club a 15-sep-2026: seis con deporte deducido de su
// historial y DOS recién entrados sin una sola clase dictada.
const PLANTILLA = [
  docente("Cristian Castro", ["tenis"]),
  docente("Esteban Graciano", ["tenis"]),
  docente("Joaquín Della Mea", ["padel"]),
  docente("Jorge Pérez", ["tenis"]),
  docente("Leo Ruíz", ["padel"]),
  docente("Sebastian Niño Mora", ["tenis"]),
  docente("Victor Acosta", []),
  docente("Yeison Bedoya", []),
];

const nombres = (d: Parameters<typeof opcionesParaDeporte>[1]) =>
  opcionesParaDeporte(PLANTILLA, d).map((p) => p.nombre);

describe("a quién se ofrece para una clase", () => {
  it("una clase de pádel ofrece a los de pádel", () => {
    const n = nombres("padel");
    expect(n).toContain("Leo Ruíz");
    expect(n).toContain("Joaquín Della Mea");
  });

  it("y NO ofrece a los de tenis", () => {
    const n = nombres("padel");
    expect(n).not.toContain("Esteban Graciano");
    expect(n).not.toContain("Cristian Castro");
  });

  it("al revés también: una de tenis no ofrece a los de pádel", () => {
    const n = nombres("tenis");
    expect(n).toContain("Esteban Graciano");
    expect(n).not.toContain("Leo Ruíz");
  });

  // El caso que motivó todo esto: el profesor NUEVO. Si se filtrara estricto por
  // deporte, Victor y Yeison no existirían en ningún selector y no habría forma
  // de entender por qué — justo el fallo callado que este proyecto ya ha pagado.
  it("el profesor nuevo, sin deporte marcado, aparece en LAS DOS", () => {
    for (const d of ["tenis", "padel"] as const) {
      expect(nombres(d)).toContain("Victor Acosta");
      expect(nombres(d)).toContain("Yeison Bedoya");
    }
  });

  it("pero va marcado aparte, no mezclado con los del deporte", () => {
    const ops = opcionesParaDeporte(PLANTILLA, "padel");
    expect(ops.find((p) => p.nombre === "Leo Ruíz")?.delDeporte).toBe(true);
    expect(ops.find((p) => p.nombre === "Victor Acosta")?.delDeporte).toBe(false);
  });

  it("los del deporte van primero", () => {
    const ops = opcionesParaDeporte(PLANTILLA, "padel");
    const primerSinMarcar = ops.findIndex((p) => !p.delDeporte);
    const ultimoDelDeporte = ops.map((p) => p.delDeporte).lastIndexOf(true);
    expect(ultimoDelDeporte).toBeLessThan(primerSinMarcar);
  });

  it("sin deporte en la clase se ofrecen todos, en un solo grupo", () => {
    const ops = opcionesParaDeporte(PLANTILLA, null);
    expect(ops).toHaveLength(PLANTILLA.length);
    expect(ops.every((p) => p.delDeporte)).toBe(true);
  });
});

describe("el selector del modal", () => {
  /**
   * Se monta `ProfesorClaseForm` suelto y NO `EventoDetalle` entero: el modal
   * usa `DialogTitle`/`DialogDescription` de Base UI, que exigen el contexto del
   * diálogo y revientan con renderToStaticMarkup ("Cannot destructure property
   * 'store' of 'useDialogRootContext(...)'"). Ya está documentado en MEMORIA a
   * raíz de la foto de turno; el patrón es el mismo que con `VistaCamara`:
   * probar el componente que lleva la lógica, con props.
   */
  const montar = async (deporte: "tenis" | "padel" | null) => {
    const { ProfesorClaseForm } = await import("@/app/(app)/clases/profesor-clase-form");
    return renderToStaticMarkup(
      React.createElement(ProfesorClaseForm, {
        claseId: 1,
        opciones: opcionesParaDeporte(PLANTILLA, deporte),
        deporte,
      }),
    );
  };

  it("ofrece un selector donde antes solo había un guión", async () => {
    const html = await montar("tenis");
    expect(html).toContain("<select");
    expect(html).toContain("Esteban Graciano");
  });

  it("titula el grupo con el deporte de la clase", async () => {
    expect(await montar("tenis")).toContain("Profesores de tenis");
    expect(await montar("padel")).toContain("Profesores de pádel");
  });

  it("no cuela profesores del otro deporte", async () => {
    const html = await montar("padel");
    expect(html).toContain("Leo Ruíz");
    expect(html).not.toContain("Esteban Graciano");
  });

  it("separa a los que no tienen deporte marcado, pero los muestra", async () => {
    const html = await montar("tenis");
    expect(html).toContain("Sin deporte asignado");
    expect(html).toContain("Victor Acosta");
  });

  it("arranca sin nadie escogido: no adivina", async () => {
    const html = await montar("tenis");
    expect(html).toContain("— Escoge —");
  });

  it("sin docentes lo dice, en vez de un selector vacío", async () => {
    const { ProfesorClaseForm } = await import("@/app/(app)/clases/profesor-clase-form");
    const html = renderToStaticMarkup(
      React.createElement(ProfesorClaseForm, { claseId: 1, opciones: [], deporte: "tenis" }),
    );
    expect(html).not.toContain("<select");
    expect(html).toContain("No hay profesores disponibles");
  });
});
