import { describe, it, expect } from "vitest";
import { generarPdfConsentimiento, fechaHoraBogota } from "../src/lib/pdf/consentimiento-pdf";
import { generarPdfReglamento } from "../src/lib/pdf/reglamento-pdf";
import { readFileSync } from "node:fs";
import path from "node:path";

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

describe("generarPdfConsentimiento · documento de oct-2026", () => {
  // El texto real, leído de la migración que lo cargó.
  const sql = readFileSync(path.join(__dirname, "..", "supabase", "migrations", "20261016100000_documentos_definitivos.sql"), "utf8");
  const texto = sql.match(/'2026-10-v2', 'menores',\s*'[^']*',\s*\$texto\$([\s\S]*?)\$texto\$/)![1];
  it("genera el PDF con la ficha, los numerales, las autorizaciones y los dos reglamentos", async () => {
    const pdf = await generarPdfConsentimiento({
      firmaId: "00000000-0000-0000-0000-000000000002",
      version: { codigo: "2026-10-v2", titulo: "CONSENTIMIENTO INFORMADO, FICHA PERSONAL Y AUTORIZACIÓN DE TRATAMIENTO DE DATOS", texto, texto_sha256: "b".repeat(64) },
      reglamento: { codigo: "reglamento-2026-10-v2", texto_sha256: "c".repeat(64) },
      academias: { codigo: "academias-2026-10", texto_sha256: "d".repeat(64) },
      autoriza: { salud: false, imagen: true, informacion: false },
      calidad: "madre",
      menor: { nombre: "Niño Prueba", documento: "TI 9990000001", fechaNacimiento: "2014-03-09", rh: null, eps: null },
      firmante: { nombre: "Mamá Prueba", documento: "9990000002", parentesco: "Madre", email: null, celular: null },
      firmaPorSiMismo: false,
      firmadoEl: "2026-10-16T20:12:00Z",
      metodo: "escrita",
      ip: "181.1.1.1",
      userAgent: "Prueba/1.0",
      firmaPng: PNG,
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeLessThan(250_000);
    const paginas = pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g)?.length ?? 0;
    expect(paginas).toBeGreaterThanOrEqual(2);
  }, 30_000);
});

describe("generarPdfConsentimiento · fotos obligatorias (v3)", () => {
  const sql = readFileSync(path.join(__dirname, "..", "supabase", "migrations", "20261016130000_autorizacion_imagen_obligatoria.sql"), "utf8");
  const texto = sql.match(/'2026-10-v3', 'menores',\s*'[^']*',\s*\$texto\$([\s\S]*?)\$texto\$/)![1];
  it("genera el PDF con el bloque AUTORIZACIÓN y la casilla de información", async () => {
    const pdf = await generarPdfConsentimiento({
      firmaId: "00000000-0000-0000-0000-000000000003",
      version: { codigo: "2026-10-v3", titulo: "CONSENTIMIENTO INFORMADO, FICHA PERSONAL Y AUTORIZACIÓN DE TRATAMIENTO DE DATOS", texto, texto_sha256: "e".repeat(64) },
      reglamento: { codigo: "reglamento-2026-10-v3", texto_sha256: "c".repeat(64) },
      academias: { codigo: "academias-2026-10", texto_sha256: "d".repeat(64) },
      autoriza: { salud: true, imagen: true, informacion: true },
      calidad: "padre",
      menor: { nombre: "Niño Prueba", documento: "TI 9990000001", fechaNacimiento: "2014-03-09", rh: "O+", eps: "Sura" },
      firmante: { nombre: "Papá Prueba", documento: "9990000002", parentesco: "Padre", email: null, celular: null },
      firmaPorSiMismo: false,
      firmadoEl: "2026-10-16T20:12:00Z",
      metodo: "escrita",
      ip: "181.1.1.1",
      userAgent: "Prueba/1.0",
      firmaPng: PNG,
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const paginas = pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g)?.length ?? 0;
    expect(paginas).toBeGreaterThanOrEqual(2);
  }, 30_000);
});

describe("generarPdfReglamento", () => {
  it("genera un PDF del reglamento con capítulos y artículos", async () => {
    const pdf = await generarPdfReglamento({ codigo: "reglamento-2026-10", titulo: "REGLAMENTO GENERAL", vigente_desde: "2026-10-08",
      texto: "Bienvenido.\n\n# CAPÍTULO 1: PRUEBA\n\n## Artículo 1. Uno\n\n" + "Texto del artículo. ".repeat(60) + "\n\n## Artículo 2. Dos\n\nMás texto." });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(5_000);
  });
});
