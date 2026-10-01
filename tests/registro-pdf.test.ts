import { describe, it, expect } from "vitest";
import { generarPdfConsentimiento, fechaHoraBogota } from "../src/lib/pdf/consentimiento-pdf";
import { parrafosDelTexto } from "../src/lib/registro/version";

/**
 * El PDF del consentimiento (plan §4.7). Se genera de verdad con datos inventados y
 * se comprueba que sale un PDF de dos páginas con tamaño razonable. El texto no se
 * puede leer del binario sin otra librería; lo que se fija es que el generador no
 * revienta con tildes, párrafos largos y una imagen de firma, y que es determinista
 * en lo que depende de nosotros.
 */
// PNG 1×1 transparente.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

const TEXTO = "Primer párrafo con tildes: niño, pádel, atención.\n\nAfiliado a la EPS {{EPS}}. Segundo párrafo.\n\n" + "Párrafo largo ".repeat(80);

describe("parrafosDelTexto", () => {
  it("parte por línea en blanco y rellena la EPS", () => {
    const p = parrafosDelTexto(TEXTO, "Sura");
    expect(p).toHaveLength(3);
    expect(p[1]).toContain("EPS Sura.");
  });
  it("sin EPS deja la raya", () => {
    expect(parrafosDelTexto("EPS {{EPS}}.", null)[0]).toBe("EPS ____________.");
  });
});

describe("fechaHoraBogota", () => {
  it("formatea en hora de Colombia, sin el espacio fino de Node", () => {
    const t = fechaHoraBogota("2026-10-01T20:12:00Z");
    expect(t).toMatch(/1 de octubre de 2026/);
    expect(t).toMatch(/3:12/);
    expect(t).not.toMatch(/ /);
  });
});

describe("generarPdfConsentimiento", () => {
  it("genera un PDF de dos páginas con la firma dentro", async () => {
    const pdf = await generarPdfConsentimiento({
      firmaId: "00000000-0000-0000-0000-000000000001",
      version: { codigo: "prueba", titulo: "TÍTULO DE PRUEBA – CENTRO DEPORTIVO", texto: TEXTO, texto_sha256: "a".repeat(64) },
      menor: { nombre: "Niño Prueba", documento: "TI 9990000001", rh: "O+", eps: "Sura" },
      firmante: { nombre: "Mamá Prueba", documento: "9990000002", parentesco: "Madre", email: null, celular: null },
      firmaPorSiMismo: false,
      firmadoEl: "2026-10-01T20:12:00Z",
      metodo: "dibujada",
      ip: "181.1.1.1",
      userAgent: "Prueba/1.0",
      firmaPng: PNG,
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(5_000);
    // El primer PDF real salió de 700 KB por embeber el logo original: se fija un techo.
    expect(pdf.length).toBeLessThan(250_000);
    // Dos páginas con un texto corto: cada una es un objeto /Type /Page.
    const paginas = pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g)?.length ?? 0;
    expect(paginas).toBe(2);
  }, 30_000);
});
