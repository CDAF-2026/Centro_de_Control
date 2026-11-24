import { it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { clienteOpenAI, responder, type RespuestaAgente } from "@/lib/agente/motor";
import { hoyBogota, isoDia } from "@/lib/periodo";

/**
 * Banco de preguntas del Agente IA (Fase 1, paso 2 · 24-nov-2026).
 *
 * Corre preguntas reales contra OpenAI y la base de producción (solo lectura) y deja
 * un informe en generated/ (no va al repo: trae datos del club). Por cada respuesta
 * separa las cifras que aparecen tal cual en lo que devolvieron las herramientas de
 * las que el modelo calculó (diferencias, sumas), que son las que hay que revisar.
 *
 *   npm run agente:banco                 # todas
 *   BANCO_SOLO=3,5 npm run agente:banco  # solo algunas (por número)
 *
 * ⚠️ GASTA en OpenAI (unos dólares por corrida). Corre con service_role: la consulta
 * libre lo admite a propósito para esto, y no hay sesión de un superadministrador.
 */

const PREGUNTAS: { texto: string; esperada: "consulta" | "analisis"; de: string }[] = [
  // Las de Laura (24-nov-2026)
  { texto: "¿Por qué mis ingresos bajaron este mes?", esperada: "analisis", de: "Laura" },
  { texto: "Dame ideas para aumentar el servicio de clases de pádel", esperada: "analisis", de: "Laura" },
  { texto: "¿Qué debería dejar de vender en la cafetería porque tiene poca rotación?", esperada: "analisis", de: "Laura" },
  { texto: "¿Cómo podría aumentar el ticket de venta por cliente?", esperada: "analisis", de: "Laura" },
  { texto: "¿Cuáles son los servicios más exitosos del club?", esperada: "analisis", de: "Laura" },
  { texto: "¿Qué profesor me es más rentable?", esperada: "analisis", de: "Laura" },
  { texto: "¿Cuáles son los horarios más convenientes para sacar promociones?", esperada: "analisis", de: "Laura" },
  // Consultas rápidas: deberían ir al modelo pequeño
  { texto: "¿Cuántos clientes activos tenemos?", esperada: "consulta", de: "banco" },
  { texto: "¿Cuánto se facturó en octubre?", esperada: "consulta", de: "banco" },
  { texto: "¿Cuánto nos deben hoy en total?", esperada: "consulta", de: "banco" },
  { texto: "¿Cuántos niños hay matriculados en las academias de pádel?", esperada: "consulta", de: "banco" },
  { texto: "¿Cuántas clases dictó cada profesor en octubre?", esperada: "consulta", de: "banco" },
  // Obliga a usar la consulta libre (el ejemplo del plan)
  { texto: "¿Qué niños de las academias llevan tres semanas o más sin asistir a ninguna clase?", esperada: "analisis", de: "plan" },
];

/** Números de 4 o más cifras de un texto ("$1.234.567" → 1234567). */
function cifras(texto: string): number[] {
  const out = new Set<number>();
  for (const m of texto.matchAll(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d{4,}/g)) {
    const n = Number(m[0].replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(n) && n >= 1000 && !(n >= 2020 && n <= 2035)) out.add(Math.round(n));
  }
  return [...out];
}

it("banco de preguntas del agente", { timeout: 60 * 60 * 1000 }, async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const openai = clienteOpenAI();
  const hoy = isoDia(hoyBogota());
  const solo = process.env.BANCO_SOLO?.split(",").map(Number);

  const filas: {
    n: number;
    pregunta: (typeof PREGUNTAS)[number];
    r?: RespuestaAgente;
    error?: string;
    ms: number;
    resultados: { nombre: string; salida: string }[];
    enDatos: number[];
    calculadas: number[];
  }[] = [];

  for (const [i, p] of PREGUNTAS.entries()) {
    const n = i + 1;
    if (solo && !solo.includes(n)) continue;
    const resultados: { nombre: string; salida: string }[] = [];
    const inicio = Date.now();
    process.stdout.write(`\n[${n}] ${p.texto}\n`);
    try {
      const r = await responder({
        openai,
        ctx: { supabase, hoy },
        pregunta: p.texto,
        alEvento: (e) => {
          if (e.tipo === "ruta") process.stdout.write(`    → ${e.ruta}\n`);
          if (e.tipo === "herramienta") process.stdout.write(`    · ${e.nombre}\n`);
        },
        alResultado: (nombre, salida) => resultados.push({ nombre, salida }),
      });
      const datos = resultados.map((x) => x.salida.replace(/\D+/g, " ")).join(" ");
      const numeros = new Set(datos.split(" ").filter(Boolean).map(Number));
      const todas = cifras(r.texto);
      filas.push({
        n,
        pregunta: p,
        r,
        ms: Date.now() - inicio,
        resultados,
        enDatos: todas.filter((c) => numeros.has(c)),
        calculadas: todas.filter((c) => !numeros.has(c)),
      });
      process.stdout.write(`    ✓ ${((Date.now() - inicio) / 1000).toFixed(0)} s · US$${r.costoUsd.toFixed(3)} · ${r.herramientas.length} consultas\n`);
    } catch (e) {
      filas.push({ n, pregunta: p, error: e instanceof Error ? e.message : String(e), ms: Date.now() - inicio, resultados, enDatos: [], calculadas: [] });
      process.stdout.write(`    ✗ ${e instanceof Error ? e.message : e}\n`);
    }
  }

  const fmt = (n: number) => n.toLocaleString("es-CO");
  const total = filas.reduce((s, f) => s + (f.r?.costoUsd ?? 0), 0);
  const md: string[] = [
    `# Banco de preguntas del Agente IA — ${hoy}`,
    "",
    `Preguntas: ${filas.length} · Costo total: US$${total.toFixed(3)} · Ruta acertada: ${filas.filter((f) => f.r?.ruta === f.pregunta.esperada).length}/${filas.length}`,
    "",
  ];
  for (const f of filas) {
    md.push(`## ${f.n}. ${f.pregunta.texto}`, "");
    if (f.error) {
      md.push(`**ERROR:** ${f.error}`, "");
      continue;
    }
    const r = f.r!;
    md.push(
      `- Ruta: **${r.ruta}**${r.escalada ? " (el pequeño la pasó al grande)" : ""} (esperada: ${f.pregunta.esperada}) · modelo ${r.modelo} · ${r.vueltas} vueltas · ${(f.ms / 1000).toFixed(0)} s · US$${r.costoUsd.toFixed(3)}`,
      `- Tokens: ${fmt(r.uso.entrada)} de entrada (${fmt(r.uso.cache)} del caché) · ${fmt(r.uso.salida)} de salida`,
      `- Consultas: ${r.herramientas.map((h) => `${h.nombre}${h.ok ? "" : " ✗"}`).join(", ") || "ninguna"}`,
      ...r.herramientas.filter((h) => !h.ok).map((h) => `  - ✗ ${h.nombre}: ${h.error}`),
      `- Cifras tal cual en los datos: ${f.enDatos.map(fmt).join(", ") || "—"}`,
      `- Cifras calculadas por el modelo (revisar): ${f.calculadas.map(fmt).join(", ") || "—"}`,
      "",
      "### Respuesta",
      "",
      r.texto,
      "",
    );
  }
  mkdirSync("generated", { recursive: true });
  const base = `generated/agente-banco-${hoy}${solo ? `-solo-${solo.join("_")}` : ""}`;
  writeFileSync(`${base}.md`, md.join("\n"));
  writeFileSync(`${base}.json`, JSON.stringify(filas, null, 1));
  process.stdout.write(`\nInforme: ${base}.md · Costo: US$${total.toFixed(3)}\n`);
});
