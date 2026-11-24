import OpenAI from "openai";
import { toResponseInputItems } from "openai/lib/responses/ResponseInputItems";
import { MODELOS, USO_CERO, costoUsd, sumarUso, usoDe, type Ruta, type Uso } from "./costo";
import { clasificar, type Mensaje } from "./enrutador";
import { definicionOpenAI, ejecutarHerramienta, herramientasPara, type Contexto, type RegistroHerramienta } from "./herramientas";
import { MANUAL, encabezadoPregunta } from "./manual";

/**
 * El motor del Agente IA (Fase 1, paso 2 · 24-nov-2026).
 *
 * 1. El modelo pequeño clasifica la pregunta (consulta o análisis).
 * 2. El modelo que toca responde con la API de Respuestas de OpenAI: pide
 *    herramientas, el motor las corre con la sesión de quien pregunta y le
 *    devuelve los resultados, y así hasta la respuesta final (máximo MAX_VUELTAS).
 * 3. Si el pequeño descubre que sus herramientas no alcanzan, llama a
 *    `pasar_a_analisis` y la pregunta empieza de nuevo con el grande. Lo cazó el
 *    banco de preguntas: "¿qué niños llevan tres semanas sin venir?" parece una
 *    lista, pero solo se responde con la consulta libre, que el pequeño no tiene.
 * 4. Todo va sin guardar en OpenAI (`store: false`, decisión del plan): la
 *    conversación vive en nuestras tablas, no allá.
 *
 * Va por partes (`alEvento`): la pantalla muestra qué está consultando y el texto
 * mientras se escribe. El motor no sabe de pantallas ni de la base de
 * conversaciones; eso es de la ruta.
 */

export const MAX_VUELTAS = 8;

export type EventoAgente =
  | { tipo: "ruta"; ruta: Ruta }
  | { tipo: "herramienta"; nombre: string; etiqueta: string }
  /** Un pedazo de la respuesta. */
  | { tipo: "texto"; delta: string }
  /** El texto que venía no era la respuesta final (el modelo siguió consultando): borrarlo. */
  | { tipo: "texto_descartado" };

export type RespuestaAgente = {
  texto: string;
  /** El modelo que dio la respuesta final. */
  ruta: Ruta;
  modelo: string;
  /** El pequeño empezó y le pasó la pregunta al grande. */
  escalada: boolean;
  herramientas: RegistroHerramienta[];
  /** Tokens del modelo que respondió (sin la clasificación ni el intento del pequeño). */
  uso: Uso;
  /** Dólares de toda la pregunta: clasificación, intento del pequeño y respuesta. */
  costoUsd: number;
  vueltas: number;
  /** La respuesta se cortó (tope de salida) o se agotaron las vueltas. */
  incompleta: boolean;
};

export function clienteOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Falta OPENAI_API_KEY.");
  return new OpenAI({ apiKey });
}

/** La salida del modelo pequeño cuando sus herramientas no alcanzan. No es de la base: la maneja el motor. */
export const PASAR_A_ANALISIS = "pasar_a_analisis";
const HERRAMIENTA_ESCALAR: OpenAI.Responses.FunctionTool = {
  type: "function",
  name: PASAR_A_ANALISIS,
  description:
    "Úsala en vez de responder si con tus herramientas no puedes contestar bien: la pregunta pide cruzar datos, encontrar personas o casos " +
    "por un comportamiento, explicar causas o proponer. Otro analista con más herramientas la responderá. No le digas a la persona que la pasaste.",
  parameters: {
    type: "object",
    properties: { motivo: { type: "string", description: "En una frase, qué te faltó." } },
    required: ["motivo"],
    additionalProperties: false,
  },
  strict: true,
};

type Opciones = {
  openai: OpenAI;
  ctx: Contexto;
  pregunta: string;
  historial?: Mensaje[];
  alEvento?: (e: EventoAgente) => void;
  senal?: AbortSignal;
  /** Para el banco de preguntas: saltarse la clasificación. */
  forzarRuta?: Ruta;
  /** Para el banco de preguntas: ver lo que devolvió cada herramienta (no va a la pantalla). */
  alResultado?: (nombre: string, salida: string) => void;
};

type Intento =
  | { escalar: true; uso: Uso; registros: RegistroHerramienta[] }
  | { escalar: false; uso: Uso; registros: RegistroHerramienta[]; texto: string; vueltas: number; incompleta: boolean };

/** Una pasada completa con un modelo: pregunta → herramientas → … → respuesta (o escalar). */
async function intentar(ruta: Ruta, opts: Opciones): Promise<Intento> {
  const { openai, ctx, pregunta, historial = [], alEvento, senal } = opts;
  const modelo = MODELOS[ruta];
  const disponibles = herramientasPara(ruta);
  const tools = disponibles.map(definicionOpenAI);
  if (ruta === "consulta") tools.push(HERRAMIENTA_ESCALAR);

  const input: OpenAI.Responses.ResponseInputItem[] = [
    ...historial.map((m) => ({ role: m.rol === "usuario" ? ("user" as const) : ("assistant" as const), content: m.contenido })),
    { role: "user", content: `${encabezadoPregunta(ctx.hoy)}\n\n${pregunta}` },
  ];

  const registros: RegistroHerramienta[] = [];
  let uso = USO_CERO;
  let vueltas = 0;

  while (vueltas < MAX_VUELTAS) {
    vueltas++;
    // En la última vuelta ya no se dejan pedir herramientas: tiene que responder.
    const ultima = vueltas === MAX_VUELTAS;
    const stream = openai.responses.stream(
      {
        model: modelo.id,
        instructions: MANUAL,
        input,
        tools,
        tool_choice: ultima ? "none" : "auto",
        parallel_tool_calls: true,
        store: false,
        reasoning: { effort: modelo.esfuerzo },
        max_output_tokens: modelo.maxSalida,
      },
      { signal: senal },
    );
    let huboTexto = false;
    for await (const ev of stream) {
      if (ev.type === "response.output_text.delta") {
        huboTexto = true;
        alEvento?.({ tipo: "texto", delta: ev.delta });
      }
    }
    const resp = await stream.finalResponse();
    uso = sumarUso(uso, usoDe(resp.usage));

    const llamadas = resp.output.flatMap((it) => (it.type === "function_call" ? [it] : []));
    if (llamadas.length === 0 || ultima) {
      let texto = resp.output_text?.trim() ?? "";
      if (!texto) {
        const negativa = resp.output
          .flatMap((it) => (it.type === "message" ? it.content : []))
          .find((c) => c.type === "refusal");
        texto = negativa && negativa.type === "refusal" ? negativa.refusal : "";
      }
      const incompleta = resp.status === "incomplete" || (ultima && llamadas.length > 0);
      return { escalar: false, uso, registros, texto, vueltas, incompleta };
    }

    if (huboTexto) alEvento?.({ tipo: "texto_descartado" });
    if (llamadas.some((ll) => ll.name === PASAR_A_ANALISIS)) return { escalar: true, uso, registros };

    // La salida completa vuelve como entrada (incluido el razonamiento cifrado:
    // sin guardar en OpenAI es la única forma de que el modelo no pierda el hilo).
    input.push(...toResponseInputItems(resp.output));
    for (const ll of llamadas) {
      const h = disponibles.find((x) => x.nombre === ll.name);
      alEvento?.({ tipo: "herramienta", nombre: ll.name, etiqueta: h?.etiqueta ?? "Consultando…" });
    }
    const resultados = await Promise.all(
      llamadas.map((ll) => ejecutarHerramienta(ll.name, ll.arguments, ctx, disponibles)),
    );
    resultados.forEach(({ salida, registro }, i) => {
      registros.push(registro);
      opts.alResultado?.(registro.nombre, salida);
      input.push({ type: "function_call_output", call_id: llamadas[i].call_id, output: salida });
    });
  }
  // No se llega aquí: la última vuelta siempre devuelve.
  return { escalar: false, uso, registros, texto: "", vueltas, incompleta: true };
}

export async function responder(opts: Opciones): Promise<RespuestaAgente> {
  const clasificacion = opts.forzarRuta
    ? { ruta: opts.forzarRuta, uso: USO_CERO }
    : await clasificar(opts.openai, opts.pregunta, opts.historial ?? []);
  let ruta = clasificacion.ruta;
  let costo = costoUsd(clasificacion.uso, "consulta");
  opts.alEvento?.({ tipo: "ruta", ruta });

  let r = await intentar(ruta, opts);
  let escalada = false;
  if (r.escalar) {
    // Lo que alcanzó a consultar el pequeño no se pierde del registro de costo,
    // pero el grande empieza de cero: su respuesta no debe apoyarse en un intento a medias.
    costo += costoUsd(r.uso, ruta);
    ruta = "analisis";
    escalada = true;
    opts.alEvento?.({ tipo: "ruta", ruta });
    r = await intentar(ruta, opts);
  }
  if (r.escalar) throw new Error("El modelo de análisis no puede pasar la pregunta a otro."); // no tiene esa herramienta

  let texto = r.texto;
  if (!texto) texto = "No logré armar una respuesta con los datos consultados. Intenta preguntarlo de otra forma o con un periodo más corto.";
  if (r.incompleta) texto += "\n\n_(La respuesta quedó incompleta: la pregunta era muy amplia. Prueba dividiéndola.)_";

  return {
    texto,
    ruta,
    modelo: MODELOS[ruta].id,
    escalada,
    herramientas: r.registros,
    uso: r.uso,
    costoUsd: costo + costoUsd(r.uso, ruta),
    vueltas: r.vueltas,
    incompleta: r.incompleta,
  };
}
