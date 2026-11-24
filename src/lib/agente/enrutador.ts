import type OpenAI from "openai";
import { MODELOS, USO_CERO, usoDe, type Ruta, type Uso } from "./costo";

/**
 * Decide qué modelo responde (decisión de Laura, 24-nov-2026): el pequeño para
 * traer un dato, el grande para razonar. En la duda, el grande: una respuesta
 * corta a una pregunta que pedía análisis es peor que gastar un poco más, y como
 * el reparto es invisible no hay botón para pedirla "a fondo".
 */

export type Mensaje = { rol: "usuario" | "agente"; contenido: string };

const INSTRUCCIONES = `Clasificas preguntas que los dueños de un club deportivo le hacen a su asistente de datos.
- "consulta": pide un dato o una lista concreta que se lee directamente: una cifra de un periodo, cuánto debe un cliente, cuántas clases hubo, quién está matriculado, el saldo de un paquete.
- "analisis": pide explicar, comparar con interpretación, encontrar causas o problemas, recomendar, proponer, priorizar, evaluar rentabilidad o armar un informe. También si la respuesta exige cruzar varias fuentes o pensar, y si hay que encontrar personas o casos por un comportamiento (quién dejó de venir, quién compra una cosa y no otra, quién lleva tiempo sin pagar).
- "duda": si no está claro cuál de las dos.
Ten en cuenta la conversación previa: "¿y por qué?" después de una cifra es "analisis".`;

/** Lo que devuelve el modelo → la ruta. Cualquier cosa rara va al grande. */
export function rutaDe(tipo: unknown): Ruta {
  return tipo === "consulta" ? "consulta" : "analisis";
}

export async function clasificar(
  openai: OpenAI,
  pregunta: string,
  historial: Mensaje[],
): Promise<{ ruta: Ruta; uso: Uso }> {
  const previo = historial
    .slice(-4)
    .map((m) => `${m.rol === "usuario" ? "Persona" : "Asistente"}: ${m.contenido.slice(0, 600)}`)
    .join("\n");
  try {
    const r = await openai.responses.create({
      model: MODELOS.consulta.id,
      store: false,
      reasoning: { effort: "low" },
      max_output_tokens: 800,
      instructions: INSTRUCCIONES,
      input: `${previo ? `Conversación previa:\n${previo}\n\n` : ""}Pregunta nueva: ${pregunta}`,
      text: {
        format: {
          type: "json_schema",
          name: "clasificacion",
          strict: true,
          schema: {
            type: "object",
            properties: { tipo: { type: "string", enum: ["consulta", "analisis", "duda"] } },
            required: ["tipo"],
            additionalProperties: false,
          },
        },
      },
    });
    let tipo: unknown = null;
    try {
      tipo = (JSON.parse(r.output_text) as { tipo?: unknown }).tipo;
    } catch {
      // Respuesta ilegible: al grande.
    }
    return { ruta: rutaDe(tipo), uso: usoDe(r.usage) };
  } catch (e) {
    // Si clasificar falla, se responde igual con el grande: no se le niega la
    // respuesta a la persona por un paso interno.
    console.error("[agente] no se pudo clasificar la pregunta:", e instanceof Error ? e.message : e);
    return { ruta: "analisis", uso: USO_CERO };
  }
}
