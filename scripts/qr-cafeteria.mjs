// Genera EL QR de la cafetería, que lleva a la carta (/carta). Es uno solo para todo el
// club (Laura, 20-nov-2026): la persona escribe dónde está al hacer el pedido, así que el
// mismo QR sirve en cualquier cancha o mesa.
//   generated/qr-cafeteria/carta.png       → 1200 px, con el logo del club en el centro
//   generated/qr-cafeteria/carta.svg       → vectorial, para el diseñador
//   generated/qr-cafeteria/imprimir.html   → hoja lista para imprimir (4 tarjetas iguales)
//
// Uso: npm run qr:cafeteria                          (apunta a https://alejandrofallacd.com/carta)
//      npm run qr:cafeteria -- http://localhost:3000 (para probar en el computador)
//
// Corrección de errores H (30 %), como el QR del registro: permite tapar el centro con
// el logo (~20 % del lado) sin que el código deje de leerse.
// `generated/` está en .gitignore: los archivos se entregan, no se versionan.
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import QRCode from "qrcode";
import sharp from "sharp";

const base = (process.argv[2] ?? "https://alejandrofallacd.com").replace(/\/+$/, "");
const LADO = 1200;
const salida = resolve("generated/qr-cafeteria");
await mkdir(salida, { recursive: true });

const opciones = { errorCorrectionLevel: "H", margin: 2, color: { dark: "#1a1c1e", light: "#ffffff" } };

const ladoLogo = Math.round(LADO * 0.2);
const ladoPlaca = Math.round(ladoLogo * 1.18);
const radio = Math.round(ladoPlaca * 0.18);
const logo = await sharp(resolve("public/registro-logo.jpg")).resize(ladoLogo, ladoLogo).png().toBuffer();
const placa = Buffer.from(
  `<svg width="${ladoPlaca}" height="${ladoPlaca}"><rect width="${ladoPlaca}" height="${ladoPlaca}" rx="${radio}" fill="#ffffff"/></svg>`,
);

async function generar(archivo, url) {
  await writeFile(resolve(salida, `${archivo}.svg`), await QRCode.toString(url, { ...opciones, type: "svg" }));
  const limpio = await QRCode.toBuffer(url, { ...opciones, type: "png", width: LADO });
  const conLogo = await sharp(limpio)
    .composite([
      { input: placa, left: Math.round((LADO - ladoPlaca) / 2), top: Math.round((LADO - ladoPlaca) / 2) },
      { input: logo, left: Math.round((LADO - ladoLogo) / 2), top: Math.round((LADO - ladoLogo) / 2) },
    ])
    .png()
    .toBuffer();
  await writeFile(resolve(salida, `${archivo}.png`), conLogo);
}

const url = `${base}/carta`;
await generar("carta", url);
console.log(`  carta → ${url}`);

/** Cuántas tarjetas iguales salen en la hoja, para recortar y repartir por el club. */
const COPIAS = 4;

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>QR cafetería · CDAF</title>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@1,800;1,900&family=Open+Sans:wght@400;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Open Sans", sans-serif; color: #1a1c1e; background: #f4f6f5; }
  .hoja { display: grid; grid-template-columns: 1fr 1fr; gap: 10mm; padding: 10mm; }
  .tarjeta { break-inside: avoid; background: #fff; border-radius: 6mm; overflow: hidden; border: 1px solid #e4e8ea; }
  .cabeza { background: #1a1c1e; color: #fff; padding: 6mm 7mm 5mm; position: relative; overflow: hidden; }
  .cabeza::after { content: ""; position: absolute; right: -6mm; top: 0; width: 26mm; height: 100%;
    background: repeating-linear-gradient(-45deg, #d4e157 0 2mm, transparent 2mm 5mm); opacity: .9; }
  .eyebrow { font-size: 7pt; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; color: #d4e157; margin: 0 0 2mm; }
  h1 { font-family: Montserrat, sans-serif; font-style: italic; font-weight: 900; text-transform: uppercase;
    font-size: 17pt; line-height: 1.1; margin: 0; position: relative; z-index: 1; }
  h1 span { background: #d4e157; color: #1a1c1e; padding: 0 1.5mm; }
  .cuerpo { padding: 5mm 7mm 6mm; text-align: center; }
  .cuerpo img { width: 58mm; height: 58mm; display: block; margin: 0 auto 3mm; }
  .zona { font-family: Montserrat, sans-serif; font-style: italic; font-weight: 800; text-transform: uppercase; font-size: 12pt; margin: 0 0 1mm; }
  .paso { font-size: 8.5pt; color: #5c6b73; margin: 0; }
</style>
</head>
<body>
<div class="hoja">
${Array.from(
  { length: COPIAS },
  () => `  <div class="tarjeta">
    <div class="cabeza">
      <p class="eyebrow">Centro Deportivo Alejandro Falla</p>
      <h1><span>¿Antojo?</span><br>Pide a la cafetería</h1>
    </div>
    <div class="cuerpo">
      <img src="carta.png" alt="QR de la carta de la cafetería">
      <p class="zona">Escanea y pide</p>
      <p class="paso">Elige, dinos dónde estás y te lo llevamos.</p>
    </div>
  </div>`,
).join("\n")}
</div>
</body>
</html>
`;
await writeFile(resolve(salida, "imprimir.html"), html);

console.log(`\nQR en ${salida} (base ${base})`);
console.log(`Hoja para imprimir: ${resolve(salida, "imprimir.html")}`);
if (base.includes("localhost")) console.log("⚠️  Apuntan a localhost: genera de nuevo con la URL publicada antes de imprimir.");
