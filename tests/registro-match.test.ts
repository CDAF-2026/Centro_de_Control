import { describe, it, expect } from "vitest";
import { normalizarNombre, soloDigitos, desempatarPorNombre, type Candidato } from "../src/lib/registro/match";

/**
 * La búsqueda del niño en el registro público (plan §4.5). Lógica pura con los
 * casos REALES que ya mordieron en este proyecto: hermanos con el mismo documento
 * (Matías/Elena Restrepo), nombres con tildes y mayúsculas ("SIMON VÉLEZ" /
 * "Simon Velez"), y nombres compuestos.
 */
const c = (id: number, nombres: string, apellidos: string, doc = "1017204187"): Candidato => ({
  miembro_id: id, cliente_id: 430, nombres, apellidos, documento: doc, fecha_nacimiento: null, es_titular: false,
});

describe("normalizarNombre", () => {
  it("quita tildes, mayúsculas, signos y dobles espacios", () => {
    expect(normalizarNombre("  SIMÓN  Vélez-Gómez ")).toBe("simon velez gomez");
    expect(normalizarNombre("Ñeque")).toBe(normalizarNombre("neque")); // la ñ cae a n en los dos lados
    expect(normalizarNombre(null)).toBe("");
  });
});

describe("soloDigitos", () => {
  it("deja solo dígitos y rechaza lo demasiado corto", () => {
    expect(soloDigitos("1.037.607-268")).toBe("1037607268");
    expect(soloDigitos("12")).toBeNull();
    expect(soloDigitos(undefined)).toBeNull();
  });
});

describe("desempatarPorNombre (hermanos con el mismo documento)", () => {
  const matias = c(584, "Matías", "Restrepo");
  const elena = c(428, "Elena", "Restrepo");

  it("con el nombre completo escoge al correcto", () => {
    expect(desempatarPorNombre([matias, elena], "matias", "restrepo").map((x) => x.miembro_id)).toEqual([584]);
    expect(desempatarPorNombre([matias, elena], "ELENA", "RESTREPO").map((x) => x.miembro_id)).toEqual([428]);
  });

  it("acepta el nombre escrito distinto ('SIMON VÉLEZ' / 'Simon Andres Velez Gomez')", () => {
    const simon = c(1, "Simon Andres", "Velez Gomez", "1");
    expect(desempatarPorNombre([simon, elena], "SIMÓN", "VÉLEZ").map((x) => x.miembro_id)).toEqual([1]);
  });

  it("si nadie casa, devuelve vacío (el que llama lo trata como ambiguo)", () => {
    expect(desempatarPorNombre([matias, elena], "Pedro", "Pérez")).toEqual([]);
  });

  it("si dos fichas tienen el MISMO nombre y documento (duplicado), quedan las dos → ambiguo", () => {
    const dup = c(999, "Matías", "Restrepo");
    expect(desempatarPorNombre([matias, dup, elena], "Matías", "Restrepo")).toHaveLength(2);
  });

  it("sin nombre no desempata: devuelve los candidatos tal cual", () => {
    expect(desempatarPorNombre([matias, elena], "", "Restrepo")).toHaveLength(2);
  });
});
