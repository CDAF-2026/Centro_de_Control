import { describe, it, expect } from "vitest";
import { consentimientoFirmadoEmail } from "../src/lib/email/consentimiento-firmado";

/** El correo con el PDF del consentimiento (D5; Laura, 2-oct-2026): texto corto, sin copia al club. */
describe("consentimientoFirmadoEmail", () => {
  it("al papá: nombra al niño, la fecha, y el adjunto lleva el nombre del niño sin tildes", () => {
    const c = consentimientoFirmadoEmail({ firmante: "Ana María Pérez", menor: "Mariana Gómez", fechaTexto: "2 de octubre de 2026, 3:12 p. m.", firmaPorSiMismo: false });
    expect(c.subject).toBe("Consentimiento informado de Mariana · Centro Deportivo Alejandro Falla");
    expect(c.html).toContain("Hola Ana,");
    expect(c.html).toContain("<strong>Mariana</strong> ya hace parte de la familia");
    expect(c.html).toContain("firmaste hoy, <strong>2 de octubre de 2026</strong>"); // sin la hora
    expect(c.html).toContain('src="https://alejandrofallacd.com/registro-logo.jpg"');
    expect(c.html).toContain("Nos vemos en la cancha 🎾");
    expect(c.filename).toBe("consentimiento-mariana-gomez.pdf");
  });

  it("si firmó por sí mismo, cambia la voz y escapa el HTML", () => {
    const c = consentimientoFirmadoEmail({ firmante: "Ana<b> Pérez", menor: "Ana<b> Pérez", fechaTexto: "hoy", firmaPorSiMismo: true });
    expect(c.html).toContain("Ya haces parte de la familia");
    expect(c.html).not.toContain("<b>");
    expect(c.html).toContain("Ana&lt;b&gt;");
  });
});
