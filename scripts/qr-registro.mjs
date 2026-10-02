// Genera el QR del registro por celular (plan §Fase 4):
//   generated/qr-registro.svg        → vectorial, para el diseñador (afiche, mesa de recepción)
//   generated/qr-registro.png        → 1200 px, limpio
//   generated/qr-registro-logo.png   → 1200 px, con el logo del club en el centro
//
// Uso: npm run qr:registro            (apunta a https://alejandrofallacd.com/registro)
//      npm run qr:registro -- <url>   (otra URL, p. ej. la de local para probar)
//
// Corrección de errores H (30 %): es lo que permite tapar el centro con el logo sin
// que el código deje de leerse. El logo cubre ~20 % del lado, por debajo de ese margen.
// `generated/` está en .gitignore: los archivos se entregan, no se versionan.
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import QRCode from "qrcode";
import sharp from "sharp";

const url = process.argv[2] ?? "https://alejandrofallacd.com/registro";
const LADO = 1200;
const MARGEN = 2; // módulos de zona tranquila
const salida = resolve("generated");
await mkdir(salida, { recursive: true });

const opciones = { errorCorrectionLevel: "H", margin: MARGEN, color: { dark: "#1a1c1e", light: "#ffffff" } };

const svg = await QRCode.toString(url, { ...opciones, type: "svg" });
await writeFile(resolve(salida, "qr-registro.svg"), svg);

const limpio = await QRCode.toBuffer(url, { ...opciones, type: "png", width: LADO });
await writeFile(resolve(salida, "qr-registro.png"), limpio);

// Logo centrado sobre una placa blanca redondeada, para que no se mezcle con los módulos.
const ladoLogo = Math.round(LADO * 0.2);
const ladoPlaca = Math.round(ladoLogo * 1.18);
const radio = Math.round(ladoPlaca * 0.18);
const logo = await sharp(resolve("public/registro-logo.jpg")).resize(ladoLogo, ladoLogo).png().toBuffer();
const placa = Buffer.from(
  `<svg width="${ladoPlaca}" height="${ladoPlaca}"><rect width="${ladoPlaca}" height="${ladoPlaca}" rx="${radio}" fill="#ffffff"/></svg>`,
);
const centroPlaca = Math.round((LADO - ladoPlaca) / 2);
const centroLogo = Math.round((LADO - ladoLogo) / 2);
const conLogo = await sharp(limpio)
  .composite([
    { input: placa, left: centroPlaca, top: centroPlaca },
    { input: logo, left: centroLogo, top: centroLogo },
  ])
  .png()
  .toBuffer();
await writeFile(resolve(salida, "qr-registro-logo.png"), conLogo);

console.log(`QR para ${url}`);
console.log(`  ${resolve(salida, "qr-registro.svg")}`);
console.log(`  ${resolve(salida, "qr-registro.png")} (${LADO} px)`);
console.log(`  ${resolve(salida, "qr-registro-logo.png")} (${LADO} px, con logo)`);
