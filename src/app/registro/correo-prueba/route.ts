import { NextResponse } from "next/server";
import { generarPdfConsentimiento, fechaHoraBogota } from "@/lib/pdf/consentimiento-pdf";
import { consentimientoFirmadoEmail } from "@/lib/email/consentimiento-firmado";
import { sendEmail } from "@/lib/email/resend";
import { versionVigente } from "@/lib/registro/version";

/**
 * SOLO EN DESARROLLO: manda el correo del consentimiento con un PDF de muestra a un correo
 * dado, para ver cómo llega sin firmar nada de verdad. En producción responde 404.
 *   http://localhost:3000/registro/correo-prueba?a=alguien@correo.com
 * ⚠️ En local sale por la cuenta de Resend del `.env` (Vena Digital), no por la del club.
 */
// PNG 1×1 transparente, como firma de muestra.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

export async function GET(req: Request) {
  if (process.env.NODE_ENV !== "development") return new NextResponse(null, { status: 404 });
  const a = new URL(req.url).searchParams.get("a")?.trim();
  if (!a || !a.includes("@")) return NextResponse.json({ error: "Falta ?a=correo" }, { status: 400 });

  const version = await versionVigente();
  if (!version) return NextResponse.json({ error: "No hay versión vigente del texto" }, { status: 400 });
  const firmadoEl = new Date().toISOString();
  const pdf = await generarPdfConsentimiento({
    firmaId: "00000000-0000-0000-0000-00000000demo",
    version: { codigo: version.codigo, titulo: version.titulo, texto: version.texto, texto_sha256: version.texto_sha256 },
    menor: { nombre: "Mariana Gómez Pérez", documento: "TI 1023456789", rh: "O+", eps: "Sura" },
    firmante: { nombre: "Ana María Pérez", documento: "43512880", parentesco: "Madre", email: a, celular: "3001234567" },
    firmaPorSiMismo: false, firmadoEl, metodo: "dibujada", ip: "127.0.0.1", userAgent: "prueba", firmaPng: PNG,
  });
  const correo = consentimientoFirmadoEmail({ firmante: "Ana María Pérez", menor: "Mariana Gómez Pérez", fechaTexto: fechaHoraBogota(firmadoEl), firmaPorSiMismo: false });
  const r = await sendEmail({ to: a, subject: correo.subject, html: correo.html, attachments: [{ filename: correo.filename, content: pdf }] });
  return NextResponse.json({ ...r, a, pdfKb: Math.round(pdf.length / 1024), remitente: process.env.RESEND_FROM ?? null });
}
