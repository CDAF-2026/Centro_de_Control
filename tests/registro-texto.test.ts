import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { calidadDelFirmante, partirConsentimiento, rellenar, resumenDelConsentimiento } from "../src/lib/registro/texto";
import { parsearReglamento, partirCapitulo } from "../src/lib/registro/reglamento";

/**
 * Los documentos definitivos revisados por el abogado (16-oct-2026). Se leen de la MISMA migración que
 * los cargó, así la prueba fija el texto real y no una copia: si alguien cambia el formato, se entera aquí.
 */
const SQL = readFileSync(path.join(__dirname, "..", "supabase", "migrations", "20261016100000_documentos_definitivos.sql"), "utf8");
function textoDe(codigo: string): string {
  const m = SQL.match(new RegExp(`'${codigo}', '[a-z]+',\\s*'[^']*',\\s*\\$texto\\$([\\s\\S]*?)\\$texto\\$`));
  if (!m) throw new Error(`No está ${codigo} en la migración`);
  return m[1];
}

describe("consentimiento de oct-2026 (menores)", () => {
  const p = partirConsentimiento("2026-10-v2", textoDe("2026-10-v2"));
  it("trae la entrada, los diez numerales con su título y las tres autorizaciones", () => {
    expect(p.entrada).toHaveLength(1);
    expect(p.entrada[0]).toMatch(/^Yo, \{\{FIRMANTE\}\}, identificado\(a\) con cédula \{\{DOCUMENTO\}\}, en calidad de \{\{CALIDAD\}\}/);
    expect(p.partes.map((x) => x.numero)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);
    expect(p.partes[0].titulo).toBe("Participación voluntaria");
    expect(p.partes[7].titulo).toBe("Tratamiento de datos personales (Ley 1581 de 2012)");
    expect(p.partes[8].titulo).toBe("Fotografías y videos");
    // El numeral 8 tiene cuatro párrafos y siguen juntos.
    expect(p.partes[7].parrafos).toHaveLength(4);
    expect(p.autorizaciones?.opciones.map((o) => o.clave)).toEqual(["salud", "imagen", "informacion"]);
    expect(p.autorizaciones?.opciones[0].titulo).toBe("Datos de salud");
    expect(p.autorizaciones?.intro[0]).toMatch(/^Con mi firma acepto el consentimiento informado/);
    expect(p.autorizaciones?.cierre[0]).toMatch(/^Puedo cambiar estas autorizaciones/);
  });
  it("habla del menor: el padre firma en su representación", () => {
    expect(textoDe("2026-10-v2")).toContain("en nombre del menor que represento");
  });
});

describe("consentimiento de oct-2026 (adultos)", () => {
  const t = textoDe("2026-10-adultos-v3");
  const p = partirConsentimiento("2026-10-adultos-v3", t);
  it("misma estructura que el de menores", () => {
    expect(p.partes).toHaveLength(10);
    expect(p.autorizaciones?.opciones).toHaveLength(3);
  });
  it("firma en nombre propio: nada de hijos ni de representación", () => {
    expect(p.entrada[0]).toContain("en nombre propio");
    expect(t).not.toMatch(/hijo|menor que represento|representante|en calidad de/i);
  });
});

/** Fotos obligatorias con un solo chulito (16-oct-2026): la migración que cargó v3 / adultos-v4. */
const SQL3 = readFileSync(path.join(__dirname, "..", "supabase", "migrations", "20261016130000_autorizacion_imagen_obligatoria.sql"), "utf8");
function textoDe3(codigo: string): string {
  const m = SQL3.match(new RegExp(`'${codigo}', '[a-z]+',\\s*'[^']*',\\s*\\$texto\\$([\\s\\S]*?)\\$texto\\$`));
  if (!m) throw new Error(`No está ${codigo} en la migración`);
  return m[1];
}

describe("consentimiento con fotos obligatorias (v3 / adultos-v4)", () => {
  for (const [codigo, base] of [["2026-10-v3", "2026-10-v2"], ["2026-10-adultos-v4", "2026-10-adultos-v3"]] as const) {
    const t = textoDe3(codigo);
    const p = partirConsentimiento(codigo, t);
    it(`${codigo}: bloque AUTORIZACIÓN único, con solo "Información del centro" como casilla opcional`, () => {
      expect(p.partes).toHaveLength(10);
      expect(p.autorizaciones?.unica).toBe(true);
      expect(p.autorizaciones?.opciones.map((o) => o.clave)).toEqual(["informacion"]);
      expect(p.autorizaciones?.opciones[0].titulo).toBe("Información del centro (opcional)");
      expect(p.autorizaciones?.intro[0]).toMatch(/^Con mi firma acepto el consentimiento informado y el Reglamento General/);
      expect(p.autorizaciones?.cierre).toEqual([]);
    });
    it(`${codigo}: las fotos son condición y la EPS y el RH siguen siendo voluntarios`, () => {
      expect(p.partes[8].parrafos[0]).toContain("es una condición para participar");
      expect(t).not.toContain("Si no lo autorizo");
      expect(p.partes[7].parrafos.join(" ")).toContain("Entregarlos es voluntario y se pueden dejar en blanco");
    });
    it(`${codigo}: los numerales 1 a 7 y 10 no cambian frente a la versión anterior`, () => {
      const antes = partirConsentimiento(base, textoDe(base));
      for (const i of [0, 1, 2, 3, 4, 5, 6, 9]) expect(p.partes[i]).toEqual(antes.partes[i]);
      expect(p.entrada).toEqual(antes.entrada);
    });
  }
  it("el resumen dice que las fotos son condición y que la EPS y el RH son opcionales", () => {
    const r = resumenDelConsentimiento("Ana Gómez", "", false, "unica").join(" ");
    expect(r).toContain("condición para participar");
    expect(r).toContain("La EPS y el RH son opcionales");
    expect(r).not.toContain("SÍ o NO");
  });
});

/** Sin casillas (16-oct-2026): v4 / adultos-v5. */
const SQL4 = readFileSync(path.join(__dirname, "..", "supabase", "migrations", "20261016150000_consentimiento_sin_casillas.sql"), "utf8");
function textoDe4(codigo: string): string {
  const m = SQL4.match(new RegExp(`'${codigo}', '[a-z]+',\\s*'[^']*',\\s*\\$texto\\$([\\s\\S]*?)\\$texto\\$`));
  if (!m) throw new Error(`No está ${codigo} en la migración`);
  return m[1];
}

describe("consentimiento sin casillas (v4 / adultos-v5)", () => {
  for (const [codigo, base] of [["2026-10-v4", "2026-10-v3"], ["2026-10-adultos-v5", "2026-10-adultos-v4"]] as const) {
    const t = textoDe4(codigo);
    const p = partirConsentimiento(codigo, t);
    it(`${codigo}: todo se acepta con la firma, sin opciones que marcar`, () => {
      expect(p.autorizaciones?.unica).toBe(true);
      expect(p.autorizaciones?.opciones).toEqual([]);
      expect(p.autorizaciones?.intro).toHaveLength(1);
      expect(p.autorizaciones?.intro[0]).toMatch(/^Con mi firma acepto/);
      expect(p.autorizaciones?.intro[0]).toContain("y (c) recibir información de eventos, torneos y promociones del centro por WhatsApp o correo. Puedo pedir en cualquier momento que no me envíen más esta información");
    });
    it(`${codigo}: la entrada y los diez numerales son los mismos de la versión anterior`, () => {
      const antes = partirConsentimiento(base, textoDe3(base));
      expect(p.entrada).toEqual(antes.entrada);
      expect(p.partes).toEqual(antes.partes);
    });
  }
  it("en menores acepta también el Reglamento de las Academias; en adultos no", () => {
    expect(textoDe4("2026-10-v4")).toContain("el Reglamento General y el Reglamento de las Academias de Tenis y Pádel del CENTRO DEPORTIVO AF");
    expect(textoDe4("2026-10-adultos-v5")).not.toContain("Academias");
  });
});

/** Fotos de menores con casilla (18-oct-2026): v5 y reglamento v4. */
const SQL5 = readFileSync(path.join(__dirname, "..", "supabase", "migrations", "20261018100000_fotos_menores_opcionales.sql"), "utf8");

describe("consentimiento de menores con casilla de fotos (v5)", () => {
  const m = SQL5.match(/'2026-10-v5', 'menores',\s*'[^']*',\s*\$texto\$([\s\S]*?)\$texto\$/);
  const t = m![1];
  const p = partirConsentimiento("2026-10-v5", t);
  it("la única opción es Fotos y videos, con el texto que pidió Laura", () => {
    expect(p.autorizaciones?.unica).toBe(true);
    expect(p.autorizaciones?.opciones.map((o) => o.clave)).toEqual(["imagen"]);
    expect(p.autorizaciones?.opciones[0].titulo).toBe("Fotos y videos");
    expect(p.autorizaciones?.opciones[0].texto).toBe("Autorizo al centro a usar fotos y videos de mi hijo(a) en su página web, sus redes sociales y su material impreso, como se indica en el numeral 9.");
  });
  it("al firmar se aceptan datos e información del centro, pero ya no las fotos", () => {
    const intro = p.autorizaciones!.intro[0];
    expect(intro).toContain("(a) el tratamiento de los datos personales de mi hijo(a)");
    expect(intro).toContain("y (b) recibir información de eventos, torneos y promociones");
    expect(intro).not.toContain("fotos");
  });
  it("el numeral 9 vuelve a la redacción del abogado de 2026-10-v2; lo demás es igual a v4", () => {
    const v2 = partirConsentimiento("2026-10-v2", textoDe("2026-10-v2"));
    const v4 = partirConsentimiento("2026-10-v4", textoDe4("2026-10-v4"));
    expect(p.partes[8]).toEqual(v2.partes[8]);
    expect(p.partes[8].parrafos[0]).toContain("Si no lo autorizo, mi hijo(a) puede participar igual");
    for (const i of [0, 1, 2, 3, 4, 5, 6, 7, 9]) expect(p.partes[i]).toEqual(v4.partes[i]);
    expect(p.entrada).toEqual(v4.entrada);
  });
  it("el reglamento v4 cambia el art. 22 por la frase neutra que aprobó Laura", () => {
    expect(SQL5).toContain("La autorización se otorga en el consentimiento informado, en los términos que este indique.");
    expect(SQL5).toContain("'reglamento-2026-10-v4'");
  });
});

describe("textos anteriores", () => {
  it("siguen partiéndose un párrafo por parte, con sus títulos y sin autorizaciones", () => {
    const viejo = Array.from({ length: 10 }, (_, i) => `Párrafo ${i + 1}.`).join("\n\n");
    const p = partirConsentimiento("2026-10", viejo);
    expect(p.partes).toHaveLength(10);
    expect(p.partes[0].titulo).toBe("Participación voluntaria");
    expect(p.autorizaciones).toBeNull();
    expect(p.entrada).toEqual([]);
  });
});

describe("rellenar", () => {
  it("pone los valores y deja raya en lo que falta", () => {
    expect(rellenar("Yo, {{FIRMANTE}}, con cédula {{DOCUMENTO}}, en calidad de {{CALIDAD}}. EPS {{EPS}}.", { firmante: "Ana", calidad: "madre" }))
      .toBe("Yo, Ana, con cédula ____________, en calidad de madre. EPS ____________.");
  });
  it("sin parentesco nombra las tres calidades posibles", () => {
    expect(rellenar("{{CALIDAD}}", {})).toBe("padre, madre o representante legal");
  });
  it("el 'Otro' de la pantalla es el representante legal", () => {
    expect(calidadDelFirmante("Madre")).toBe("madre");
    expect(calidadDelFirmante("Padre")).toBe("padre");
    expect(calidadDelFirmante("Acudiente")).toBe("representante legal");
    expect(calidadDelFirmante(null)).toBe("");
  });
});

describe("resumen del documento de oct-2026", () => {
  it("no da por autorizadas las fotos: se eligen con SÍ o NO", () => {
    const r = resumenDelConsentimiento("Mariana Gómez", "", false, true).join(" ");
    expect(r).toContain("con SÍ o NO");
    expect(r).not.toMatch(/Autorizas .*fotos/);
    expect(r).toContain("La EPS de Mariana cubre");
  });
});

describe("reglamentos de oct-2026", () => {
  it("el General trae sus 8 capítulos y el Anexo 1, sin el SÍ/NO de imagen del anexo", () => {
    const t = textoDe("reglamento-2026-10-v2");
    const r = parsearReglamento(t);
    const cabs = r.capitulos.map((c) => partirCapitulo(c.titulo));
    expect(cabs.filter((c) => c.tipo === "Capítulo")).toHaveLength(8);
    const anexo = cabs.at(-1)!;
    expect(anexo).toMatchObject({ tipo: "Anexo", numero: "1" });
    expect(r.capitulos.at(-1)!.articulos.map((a) => a.titulo.split(".")[0])).toEqual(
      ["PRIMERO", "SEGUNDO", "TERCERO", "CUARTO", "QUINTO", "SEXTO", "SÉPTIMO", "OCTAVO", "NOVENO"]);
    expect(t).not.toContain("☐");
    expect(t).not.toMatch(/ATENTAMENTE|GRACIAS POR CONFIAR/);
    expect(t).toContain("antelación mínima de doce (12) horas");
  });
  it("el de Academias trae sus 9 puntos, sin capítulos", () => {
    const r = parsearReglamento(textoDe("academias-2026-10"));
    expect(r.preambulo[0]).toMatch(/^El presente reglamento tiene como finalidad/);
    expect(r.capitulos).toHaveLength(1);
    expect(r.capitulos[0].titulo).toBe("");
    expect(r.capitulos[0].articulos.map((a) => a.titulo)).toEqual([
      "1. Puntualidad", "2. Pago de Clases", "3. Reposición de Clases", "4. Normas Generales de Comportamiento",
      "5. Política de Cancelación y Suspensión de Clases", "6. Modificaciones y Actualizaciones",
      "7. Responsabilidad y Seguridad", "8. Datos Personales e Imagen", "9. Aceptación del Reglamento",
    ]);
  });
});
