import { describe, it, expect } from "vitest";
import { datosSchema } from "../src/lib/registro/esquemas";
import { resumenDelConsentimiento, titulosDelTexto } from "../src/lib/registro/texto";

/**
 * La facturación del formulario de datos es OBLIGATORIA (Laura, 1-oct-2026): la
 * pantalla copia los datos del acudiente elegido a los campos de facturación, pero
 * es el servidor quien exige que lleguen llenos. Y la capa de lectura del
 * consentimiento (títulos y resumen) no toca el texto legal.
 */
const base = {
  acepto_datos: "on",
  nombres: "Mariana", apellidos: "Gómez Pérez", tipoDocumento: "TI", documento: "1023456789",
  fechaNacimiento: "2017-03-14", eps: "Sura",
  acudienteRol: "madre", acudienteNombre: "Ana María Pérez", acudienteDocumento: "43512880",
  acudienteTelefono: "3001234567", acudienteEmail: "ana@correo.com",
};

describe("datosSchema · facturación obligatoria", () => {
  it("sin facturación, rechaza y señala sus campos", () => {
    const r = datosSchema.safeParse(base);
    expect(r.success).toBe(false);
    const campos = r.success ? [] : r.error.issues.map((i) => String(i.path[0]));
    for (const c of ["facturaDe", "facturaTipo", "facturaANombre", "facturaANit", "facturaEmail"]) expect(campos, c).toContain(c);
  });

  it("con los datos copiados del acudiente, pasa", () => {
    const r = datosSchema.safeParse({ ...base, facturaDe: "acudiente", facturaTipo: "natural", facturaANombre: "Ana María Pérez", facturaANit: "43.512.880", facturaEmail: "ana@correo.com" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.facturaANit).toBe("43512880"); // solo dígitos
  });

  it("con 'otra persona o empresa' exige el correo de facturas válido", () => {
    const r = datosSchema.safeParse({ ...base, facturaDe: "otro", facturaTipo: "juridica", facturaANombre: "Empresa SAS", facturaANit: "900123456", facturaEmail: "no-es-correo" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.map((i) => i.path[0])).toContain("facturaEmail");
  });
});

describe("capa de lectura del consentimiento", () => {
  it("la versión 2026-10 tiene un título por cada uno de sus 10 párrafos; otra versión sale genérica", () => {
    expect(titulosDelTexto("2026-10", 10)).toHaveLength(10);
    expect(titulosDelTexto("2026-10", 10)[3]).toBe("EPS y cobertura en salud");
    expect(titulosDelTexto("2026-10", 11)).toEqual(Array.from({ length: 11 }, (_, i) => `Parte ${i + 1}`));
    expect(titulosDelTexto("2027-01", 3)).toEqual(["Parte 1", "Parte 2", "Parte 3"]);
  });

  it("el resumen nombra al niño y su EPS, y cambia de voz si firma por sí mismo", () => {
    const menor = resumenDelConsentimiento("Mariana Gómez", "Sura", false);
    expect(menor[0]).toContain("Mariana Gómez participa");
    expect(menor[2]).toContain("(Sura)");
    const adulto = resumenDelConsentimiento("Ana Pérez", "Sura", true);
    expect(adulto[0]).toContain("Participas");
    expect(adulto[4]).toContain("tus datos");
  });
});

import { capitalizarNombre } from "../src/lib/nombres";
describe("capitalizarNombre", () => {
  it("pone mayúscula inicial y respeta partículas, guiones y apóstrofos", () => {
    expect(capitalizarNombre("laura salazar")).toBe("Laura Salazar");
    expect(capitalizarNombre("MARÍA DE LOS ÁNGELES  pérez")).toBe("María de los Ángeles Pérez");
    expect(capitalizarNombre("ana-maría d'alessandro")).toBe("Ana-María D'Alessandro");
    expect(capitalizarNombre("  de la calle ")).toBe("De la Calle");
    expect(capitalizarNombre("")).toBe("");
    expect(capitalizarNombre(null)).toBe("");
  });
});
