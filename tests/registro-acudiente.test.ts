import { describe, it, expect } from "vitest";
import { rolDesdeParentesco } from "../src/lib/registro/acudiente";

describe("rolDesdeParentesco (botón 'Usar los datos del contacto de emergencia')", () => {
  it("mamá, madre y variantes marcan Madre", () => {
    for (const t of ["Mamá", "mama", "MADRE", "la mamá", "Mami"]) expect(rolDesdeParentesco(t)).toBe("madre");
  });
  it("papá, padre y variantes marcan Padre", () => {
    for (const t of ["Papá", "papa", "Padre", "el papá", "papi"]) expect(rolDesdeParentesco(t)).toBe("padre");
  });
  it("cualquier otro parentesco, o vacío, es Otro familiar", () => {
    for (const t of ["Abuela", "tío", "Madrina", "Padrino", "abuela materna", "", null, undefined]) expect(rolDesdeParentesco(t)).toBe("otro");
  });
});
