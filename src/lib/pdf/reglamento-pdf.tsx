import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { parsearReglamento, partirCapitulo } from "@/lib/registro/reglamento";

/** El Reglamento General en PDF, para descargar desde /registro/reglamento (opción A, 8-oct-2026). */
const s = StyleSheet.create({
  page: { paddingTop: 30, paddingBottom: 40, paddingHorizontal: 42, fontSize: 8.5, fontFamily: "Helvetica", lineHeight: 1.3, color: "#1a1c1e" },
  cab: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  logo: { width: 46, height: 46 },
  club: { fontSize: 9, fontFamily: "Helvetica-Bold", letterSpacing: 1, textTransform: "uppercase" },
  titulo: { fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 8 },
  cap: { fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 12, marginBottom: 4, color: "#37474f" },
  art: { fontSize: 9, fontFamily: "Helvetica-Bold", marginTop: 6, marginBottom: 2 },
  p: { marginBottom: 4, textAlign: "justify" },
  pie: { position: "absolute", bottom: 20, left: 42, right: 42, fontSize: 7, color: "#5c6b73", textAlign: "center" },
});

export async function generarPdfReglamento(v: { codigo: string; titulo: string; texto: string; vigente_desde: string | null }): Promise<Buffer> {
  let logo: Buffer | null = null;
  try { logo = await readFile(path.join(process.cwd(), "src", "lib", "pdf", "logo-cdaf-240.png")); } catch { logo = null; }
  const r = parsearReglamento(v.texto);
  return renderToBuffer(
    <Document title="Reglamento General · Centro Deportivo Alejandro Falla" author="Centro Deportivo Alejandro Falla" language="es">
      <Page size="LETTER" style={s.page}>
        <View style={s.cab}>
          <View>
            <Text style={s.club}>Centro Deportivo Alejandro Falla</Text>
            <Text style={{ fontSize: 7, color: "#5c6b73" }}>Versión {v.codigo}{v.vigente_desde ? ` · vigente desde ${v.vigente_desde}` : ""}</Text>
          </View>
          {logo && <Image src={logo} style={s.logo} />}
        </View>
        <Text style={s.titulo}>{v.titulo}</Text>
        {r.preambulo.map((p, i) => <Text key={`p${i}`} style={s.p}>{p}</Text>)}
        {r.capitulos.map((c, ci) => {
          const { numero, nombre } = partirCapitulo(c.titulo);
          return (
            <View key={ci}>
              <Text style={s.cap}>{numero ? `Capítulo ${numero} · ` : ""}{nombre}</Text>
              {c.intro.map((p, i) => <Text key={`i${i}`} style={s.p}>{p}</Text>)}
              {c.articulos.map((a, ai) => (
                <View key={ai}>
                  <Text style={s.art}>{a.titulo}</Text>
                  {a.parrafos.map((p, i) => <Text key={i} style={s.p}>{p}</Text>)}
                </View>
              ))}
            </View>
          );
        })}
        <Text style={s.pie} fixed render={({ pageNumber, totalPages }) => `Centro Deportivo Alejandro Falla · alejandrofallacd.com/registro/reglamento · Página ${pageNumber} de ${totalPages}`} />
      </Page>
    </Document>,
  );
}
