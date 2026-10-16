import { NextResponse } from "next/server";
import { reglamentoAcademiasVigente } from "@/lib/registro/version";
import { generarPdfReglamento } from "@/lib/pdf/reglamento-pdf";

/** Descarga del Reglamento de Academias vigente en PDF (público, como la página). */
export async function GET() {
  const v = await reglamentoAcademiasVigente();
  if (!v) return new NextResponse(null, { status: 404 });
  const pdf = await generarPdfReglamento(v, { nombre: "Reglamento de Academias", ruta: "/registro/reglamento-academias" });
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="reglamento-academias-cdaf-${v.codigo}.pdf"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
