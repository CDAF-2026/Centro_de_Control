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

describe("fotos y videos de menores sin autorizar (18-oct-2026)", () => {
  it("el correo al papá dice que el club ya fue avisado, solo si no autorizó", async () => {
    const { consentimientoFirmadoEmail } = await import("../src/lib/email/consentimiento-firmado");
    const base = { firmante: "Ana Gómez", menor: "Tomás Ruiz", fechaTexto: "18 de octubre de 2026, 3:12 p. m.", firmaPorSiMismo: false };
    const con = consentimientoFirmadoEmail({ ...base, sinImagen: true }).html;
    expect(con).toContain("No autorizaste el uso de fotos y videos de <strong>Tomás</strong>");
    expect(con).toContain("le avisamos al Centro Deportivo Alejandro Falla de tu decisión");
    expect(con).toContain("centrodeportivoaf@gmail.com");
    expect(consentimientoFirmadoEmail(base).html).not.toContain("No autorizaste");
  });
  it("el aviso al club va a centrodeportivoaf@gmail.com con quién, de quién y el enlace a la ficha", async () => {
    const { noAutorizoImagenEmail } = await import("../src/lib/email/no-autorizo-imagen");
    const a = noAutorizoImagenEmail({ menor: "Tomás Ruiz", menorDocumento: "TI 9990000101", firmante: "Ana Gómez", firmanteDocumento: "9990000202", calidad: "madre", fechaTexto: "18 de octubre de 2026, 3:12 p. m.", clienteId: 123 });
    expect(a.to).toBe("centrodeportivoaf@gmail.com");
    expect(a.subject).toBe("No autorizó fotos y videos · Tomás Ruiz");
    expect(a.html).toContain("Ana Gómez (madre, CC 9990000202)");
    expect(a.html).toContain("<strong>no autorizó</strong> el uso de fotos y videos de <strong>Tomás Ruiz</strong> (TI 9990000101)");
    expect(a.html).toContain("https://alejandrofallacd.com/clientes/123");
    const sinFicha = noAutorizoImagenEmail({ menor: "Tomás Ruiz", menorDocumento: "TI 9990000101", firmante: "Ana <b>", firmanteDocumento: "1", calidad: "", fechaTexto: "x", clienteId: null });
    expect(sinFicha.html).toContain("https://alejandrofallacd.com/clientes/registros");
    expect(sinFicha.html).toContain("Ana &lt;b&gt; (CC 1)");
  });
});
