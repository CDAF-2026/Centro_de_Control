#!/usr/bin/env node
/**
 * Generación de imágenes con la API de OpenAI (gpt-image-1).
 *
 * Uso:
 *   node --env-file=.env scripts/generate-image.mjs "tu prompt" [opciones]
 *
 * Opciones:
 *   --size 1024x1024 | 1536x1024 | 1024x1536 | auto   (def: 1024x1024)
 *   --quality low | medium | high | auto              (def: high)
 *   --model gpt-image-1 | dall-e-3                    (def: $OPENAI_IMAGE_MODEL o gpt-image-1)
 *   --out ruta/archivo.png                            (def: generated/img-<fecha>.png)
 *
 * ⚠️ SOLO uso server-side / local. Nunca exponer OPENAI_API_KEY en el cliente.
 * La función generateImage() se portará a src/lib/openai/images.ts al montar la app Next.js.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Llama a la API de imágenes de OpenAI y devuelve un Buffer PNG.
 * @param {{prompt:string, model?:string, size?:string, quality?:string}} params
 * @returns {Promise<Buffer>}
 */
export async function generateImage({ prompt, model = 'gpt-image-1', size = '1024x1024', quality = 'high' }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Falta OPENAI_API_KEY en el entorno.');

  const body = { model, prompt, size, n: 1 };
  if (model === 'dall-e-3') {
    body.quality = quality === 'high' ? 'hd' : 'standard';
    body.response_format = 'b64_json';
  } else {
    body.quality = quality; // gpt-image-1: low | medium | high | auto
  }

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.error?.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.code = json?.error?.code;
    throw err;
  }
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new Error('La respuesta no contiene imagen (b64_json).');
  return Buffer.from(b64, 'base64');
}

async function main() {
  const args = process.argv.slice(2);
  const opts = {
    size: '1024x1024',
    quality: 'high',
    model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
    out: null,
  };
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--size') opts.size = args[++i];
    else if (a === '--quality') opts.quality = args[++i];
    else if (a === '--model') opts.model = args[++i];
    else if (a === '--out') opts.out = args[++i];
    else positional.push(a);
  }
  const prompt = positional.join(' ').trim();
  if (!prompt) {
    console.error('❌ Falta el prompt.\n   Ej: node --env-file=.env scripts/generate-image.mjs "un logo de tenis minimalista"');
    process.exit(1);
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ Falta OPENAI_API_KEY. Ejecuta con: node --env-file=.env scripts/generate-image.mjs "..."');
    process.exit(1);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = opts.out || join('generated', `img-${stamp}.png`);

  console.log('🎨 Generando imagen…');
  console.log(`   modelo: ${opts.model} · tamaño: ${opts.size} · calidad: ${opts.quality}`);
  console.log(`   prompt: ${prompt}`);

  try {
    const buf = await generateImage({ prompt, model: opts.model, size: opts.size, quality: opts.quality });
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, buf);
    console.log(`✅ Imagen guardada: ${outPath} (${(buf.length / 1024).toFixed(0)} KB)`);
  } catch (e) {
    console.error(`❌ Error ${e.status || ''} ${e.code || ''}: ${e.message}`);
    if (e.status === 403 && /verif/i.test(e.message)) {
      console.error('ℹ️  gpt-image-1 requiere verificar la organización en OpenAI. Prueba con: --model dall-e-3');
    }
    process.exit(2);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
