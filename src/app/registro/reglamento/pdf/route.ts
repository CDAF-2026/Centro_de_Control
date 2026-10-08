import { NextResponse } from "next/server";
import { reglamentoVigente } from "@/lib/registro/version";
import { generarPdfReglamento } from "@/lib/pdf/reglamento-pdf";

/** Descarga del Reglamento General vigente en PDF (público, como la página). */
export async function GET() {
  const v = await reglamentoVigente();
  if (!v) return new NextResponse(null, { status: 404 });
  const pdf = await generarPdfReglamento(v);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="reglamento-cdaf-${v.codigo}.pdf"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
