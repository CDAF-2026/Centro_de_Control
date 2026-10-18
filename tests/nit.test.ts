import { describe, it, expect } from "vitest";
import { dvNit, nitSinDv, nitConDv } from "../src/lib/nit";

describe("NIT y dígito de verificación (DIAN)", () => {
  it("calcula el DV de NITs reales", () => {
    expect(dvNit("901534314")).toBe(8); // Digitalaw Legaltech SAS
    expect(dvNit("890903938")).toBe(8); // Bancolombia
    expect(dvNit("800197268")).toBe(4); // DIAN
    expect(dvNit("901482072")).toBe(6); // el propio Centro Deportivo (NIT 901482072-6)
    expect(dvNit("")).toBeNull();
  });
  it("separa el DV si lo escriben con guion o pegado", () => {
    expect(nitSinDv("901534314-8")).toBe("901534314");
    expect(nitSinDv("901.534.314 - 8")).toBe("901534314");
    expect(nitSinDv("9015343148")).toBe("901534314");
    expect(nitSinDv("901534314")).toBe("901534314");
    // 10 dígitos cuyo último NO es el DV: se deja como está (no se adivina).
    expect(nitSinDv("9015343147")).toBe("9015343147");
  });
  it("muestra el NIT con su DV", () => {
    expect(nitConDv("901534314")).toBe("901534314-8");
    expect(nitConDv("8600352008")).toBe("860035200-8"); // Atalaya: Siigo lo tiene con el DV pegado
    expect(nitConDv(null)).toBe("");
  });
});
