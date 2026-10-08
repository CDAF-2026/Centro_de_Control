import "server-only";
import path from "node:path";
import { readFile } from "node:fs/promises";
import React from "react";
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { parrafosDelTexto } from "@/lib/registro/version";

/**
 * El PDF del consentimiento firmado (plan §4.7).
 *
 * Página 1: logo, título, el texto de la versión con la EPS puesta, los datos del
 * menor y del representante legal, la imagen de la firma y la fecha-hora en hora
 * de Colombia. Página 2: "Registro de firma electrónica" con la evidencia.
 *
 * La huella SHA-256 del archivo NO puede ir dentro del archivo (cambiaría al
 * escribirla): se guarda en `consentimiento_firma.pdf_sha256` y la ficha la muestra.
 * Lo que sí va dentro es el hash del TEXTO firmado y el id de la firma.
 *
 * Fuentes: las estándar (Helvetica) cubren tildes y ñ. Montserrat/Open Sans
 * embebidas quedan como mejora si Laura quiere la marca en el PDF.
 */
export type DatosPdf = {
  firmaId: string;
  version: { codigo: string; titulo: string; texto: string; texto_sha256: string };
  /** Reglamento General aceptado con la firma (opción A, 8-oct-2026); null en firmas viejas. */
  reglamento?: { codigo: string; texto_sha256: string } | null;
  menor: { nombre: string; documento: string | null; rh: string | null; eps: string | null };
  firmante: { nombre: string; documento: string; parentesco: string | null; email: string | null; celular: string | null };
  firmaPorSiMismo: boolean;
  firmadoEl: string; // ISO (hora del servidor)
  metodo: "dibujada" | "escrita";
  ip: string | null;
  userAgent: string | null;
  firmaPng: Buffer;
};

const s = StyleSheet.create({
  page: { paddingTop: 30, paddingBottom: 40, paddingHorizontal: 42, fontSize: 8, fontFamily: "Helvetica", lineHeight: 1.28, color: "#1a1c1e" },
  cab: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  logo: { width: 46, height: 46 },
  club: { fontSize: 7, letterSpacing: 1.2, color: "#5c6b73", textTransform: "uppercase" },
  titulo: { fontSize: 9, fontFamily: "Helvetica-Bold", textAlign: "center", marginBottom: 8, lineHeight: 1.25 },
  p: { marginBottom: 4.5, textAlign: "justify" },
  datos: { marginTop: 8, borderTopWidth: 1, borderTopColor: "#d4e157", paddingTop: 8 },
  fila: { flexDirection: "row", marginBottom: 3 },
  k: { width: 190, color: "#5c6b73" },
  v: { flex: 1, fontFamily: "Helvetica-Bold" },
  firmaBox: { marginTop: 6, flexDirection: "row", alignItems: "flex-end", gap: 16 },
  firmaImg: { width: 180, height: 56, objectFit: "contain", borderBottomWidth: 1, borderBottomColor: "#1a1c1e" },
  firmaNota: { fontSize: 7.5, color: "#5c6b73", flex: 1 },
  pie: { position: "absolute", bottom: 24, left: 44, right: 44, fontSize: 6.8, color: "#8a9399", textAlign: "center" },
  h2: { fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 10 },
  ev: { flexDirection: "row", marginBottom: 6, borderBottomWidth: 0.5, borderBottomColor: "#e2e5e4", paddingBottom: 4 },
  evk: { width: 170, color: "#5c6b73" },
  evv: { flex: 1 },
});

/** Fecha y hora legibles en Colombia. Server-only, así que `Intl` aquí no tiene problema de hidratación. */
export function fechaHoraBogota(iso: string): string {
  const f = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
  });
  return f.format(new Date(iso)).replace(/ /g, " ");
}

function Doc({ d, logo }: { d: DatosPdf; logo: Buffer | null }) {
  const parrafos = parrafosDelTexto(d.version.texto, d.menor.eps);
  const cuando = fechaHoraBogota(d.firmadoEl);
  return (
    <Document title={`Consentimiento informado · ${d.menor.nombre}`} author="Centro Deportivo Alejandro Falla" language="es">
      <Page size="LETTER" style={s.page}>
        <View style={s.cab}>
          <View>
            <Text style={s.club}>Centro Deportivo Alejandro Falla</Text>
            <Text style={{ fontSize: 7, color: "#5c6b73" }}>Versión del texto {d.version.codigo}</Text>
          </View>
          {logo && <Image src={logo} style={s.logo} />}
        </View>
        <Text style={s.titulo}>{d.version.titulo}</Text>
        {parrafos.map((p, i) => (
          <Text key={i} style={s.p}>{p}</Text>
        ))}

        <View style={s.datos}>
          <View style={s.fila}><Text style={s.k}>{d.firmaPorSiMismo ? "Nombre" : "Nombre del menor"}</Text><Text style={s.v}>{d.menor.nombre}</Text></View>
          <View style={s.fila}><Text style={s.k}>Documento de identidad</Text><Text style={s.v}>{d.menor.documento ?? "—"}</Text></View>
          <View style={s.fila}><Text style={s.k}>RH</Text><Text style={s.v}>{d.menor.rh ?? "—"}</Text></View>
          <View style={s.fila}><Text style={s.k}>EPS</Text><Text style={s.v}>{d.menor.eps ?? "—"}</Text></View>
          {!d.firmaPorSiMismo && (
            <>
              <View style={s.fila}><Text style={s.k}>Nombre del representante legal</Text><Text style={s.v}>{d.firmante.nombre}</Text></View>
              <View style={s.fila}><Text style={s.k}>Cédula del representante legal</Text><Text style={s.v}>{d.firmante.documento}</Text></View>
              {d.firmante.parentesco && (
                <View style={s.fila}><Text style={s.k}>Parentesco</Text><Text style={s.v}>{d.firmante.parentesco}</Text></View>
              )}
            </>
          )}
          <View style={s.firmaBox}>
            <Image src={d.firmaPng} style={s.firmaImg} />
            <Text style={s.firmaNota}>
              Firma {d.metodo === "escrita" ? "escrita" : "manuscrita"} de {d.firmante.nombre}.{"\n"}
              Firmado electrónicamente el {cuando} (hora de Colombia).
              {d.reglamento ? `\nCon esta firma acepta además el Reglamento General del club (versión ${d.reglamento.codigo}).` : ""}
            </Text>
          </View>
        </View>
        <Text style={s.pie} fixed>
          Firma electrónica · Ley 527 de 1999 y Decreto 2364 de 2012 · Registro {d.firmaId} · La evidencia completa está en la última página
        </Text>
      </Page>

      <Page size="LETTER" style={s.page}>
        <Text style={s.h2}>Registro de firma electrónica</Text>
        <Text style={{ marginBottom: 12, color: "#5c6b73" }}>
          Este registro acompaña al consentimiento de las páginas anteriores y permite verificar quién lo firmó, cuándo y sobre qué texto.
        </Text>
        {[
          ["Identificador de la firma", d.firmaId],
          ["Firmante", `${d.firmante.nombre} · ${d.firmante.documento}`],
          ["Firma por", d.firmaPorSiMismo ? "sí mismo (mayor de edad)" : `${d.menor.nombre}${d.firmante.parentesco ? ` (${d.firmante.parentesco})` : ""}`],
          ["Correo / celular del firmante", [d.firmante.email, d.firmante.celular].filter(Boolean).join(" · ") || "—"],
          ["Método", d.metodo === "dibujada" ? "Firma dibujada en pantalla (dedo, lápiz o ratón)" : "Nombre escrito y aceptado como firma"],
          ["Fecha y hora del servidor", `${cuando} (America/Bogota) · ${d.firmadoEl} (UTC)`],
          ["Dirección IP", d.ip ?? "—"],
          ["Navegador", d.userAgent ?? "—"],
          ["Versión del texto firmado", d.version.codigo],
          ["Huella SHA-256 del texto", d.version.texto_sha256],
          ...(d.reglamento
            ? [["Reglamento General aceptado", `${d.reglamento.codigo} · alejandrofallacd.com/registro/reglamento`], ["Huella SHA-256 del reglamento", d.reglamento.texto_sha256]]
            : []),
          ["Integridad del archivo", "La huella SHA-256 de este PDF está registrada en la plataforma del club y se muestra en la ficha del deportista."],
        ].map(([k, v]) => (
          <View key={k} style={s.ev}><Text style={s.evk}>{k}</Text><Text style={s.evv}>{v}</Text></View>
        ))}
        <Text style={s.pie} fixed>Centro Deportivo Alejandro Falla · alejandrofallacd.com</Text>
      </Page>
    </Document>
  );
}

/**
 * Genera el PDF. El logo es una copia de 240 px junto a este archivo: el
 * `public/logo-cdaf.png` original pesa 756 KB y react-pdf lo embebe tal cual —
 * medido: el primer PDF salió de 700 KB solo por el logo. Si falta, sale sin logo.
 */
export async function generarPdfConsentimiento(d: DatosPdf): Promise<Buffer> {
  let logo: Buffer | null = null;
  try {
    logo = await readFile(path.join(process.cwd(), "src", "lib", "pdf", "logo-cdaf-240.png"));
  } catch {
    logo = null;
  }
  return renderToBuffer(<Doc d={d} logo={logo} />);
}
