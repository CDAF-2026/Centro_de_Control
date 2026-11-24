import { describe, it, expect } from "vitest";
import { z } from "zod";
import type OpenAI from "openai";
import { costoUsd, MODELOS } from "@/lib/agente/costo";
import { rutaDe } from "@/lib/agente/enrutador";
import { encabezadoPregunta } from "@/lib/agente/manual";
import { MAX_VUELTAS, responder, type EventoAgente } from "@/lib/agente/motor";
import {
  HERRAMIENTAS,
  MAX_SALIDA,
  definicionOpenAI,
  ejecutarHerramienta,
  herramientasPara,
  type Contexto,
} from "@/lib/agente/herramientas";
import { ErrorDeUso, herramienta, normalizar, resolverServicio } from "@/lib/agente/herramientas/comun";
import { franjasDeReservas } from "@/lib/easycancha/ocupacion";
import type { EcBooking } from "@/lib/easycancha/client";

/**
 * Agente IA · Fase 1, paso 2 (24-nov-2026): el motor, sin gastar en OpenAI ni tocar
 * la base. Lo que sí habla con los dos se prueba con el banco de preguntas
 * (`npm run agente:banco`).
 */

const ctx = { supabase: null as never, hoy: "2026-11-24" } satisfies Contexto;

describe("herramientas", () => {
  it("nombres únicos y definiciones en modo estricto", () => {
    const nombres = HERRAMIENTAS.map((h) => h.nombre);
    expect(new Set(nombres).size).toBe(nombres.length);
    for (const h of HERRAMIENTAS) {
      const d = definicionOpenAI(h);
      const p = d.parameters as { type: string; properties: Record<string, unknown>; required: string[]; additionalProperties: boolean };
      expect(d.strict, h.nombre).toBe(true);
      expect(p.type).toBe("object");
      expect(p.additionalProperties, h.nombre).toBe(false);
      // El modo estricto exige que TODO campo sea obligatorio (lo opcional va como null).
      expect([...p.required].sort(), h.nombre).toEqual(Object.keys(p.properties).sort());
      expect(JSON.stringify(d.parameters)).not.toContain("$schema");
    }
  });

  it("el modelo de consultas NO tiene la consulta libre", () => {
    const consulta = herramientasPara("consulta").map((h) => h.nombre);
    const analisis = herramientasPara("analisis").map((h) => h.nombre);
    expect(consulta).not.toContain("consulta_libre");
    expect(consulta).not.toContain("describir_tablas");
    expect(analisis).toContain("consulta_libre");
    expect(analisis.length).toBe(HERRAMIENTAS.length);
  });

  it("ejecutar nunca lanza: los errores vuelven como texto para el modelo", async () => {
    const eco = herramienta({
      nombre: "eco",
      etiqueta: "Eco…",
      descripcion: "prueba",
      esquema: z.object({ n: z.number().int(), modo: z.enum(["ok", "uso", "base", "grande"]) }),
      async ejecutar(_c, a) {
        if (a.modo === "uso") throw new ErrorDeUso("La categoría no existe.");
        if (a.modo === "base") throw new Error("connection reset");
        return { datos: a.modo === "grande" ? "x".repeat(MAX_SALIDA + 10) : { n: a.n }, fuente: "Prueba", periodo: "hoy" };
      },
    });
    const lista = [eco] as never[];
    const correr = (nombre: string, args: string) => ejecutarHerramienta(nombre, args, ctx, lista);

    const ok = await correr("eco", JSON.stringify({ n: 3, modo: "ok" }));
    expect(JSON.parse(ok.salida)).toEqual({ fuente: "Prueba", periodo: "hoy", datos: { n: 3 } });
    expect(ok.registro).toMatchObject({ nombre: "eco", ok: true, fuente: "Prueba", periodo: "hoy", argumentos: { n: 3, modo: "ok" } });

    expect(JSON.parse((await correr("nada", "{}")).salida).error).toMatch(/No existe/);
    expect(JSON.parse((await correr("eco", "{no es json")).salida).error).toMatch(/JSON/);
    expect(JSON.parse((await correr("eco", JSON.stringify({ n: "tres", modo: "ok" }))).salida).error).toMatch(/Argumentos inválidos/);
    const uso = await correr("eco", JSON.stringify({ n: 1, modo: "uso" }));
    expect(JSON.parse(uso.salida).error).toBe("La categoría no existe.");
    expect(uso.registro.ok).toBe(false);
    expect(JSON.parse((await correr("eco", JSON.stringify({ n: 1, modo: "base" }))).salida).error).toBe("Falló la consulta: connection reset");
    const grande = await correr("eco", JSON.stringify({ n: 1, modo: "grande" }));
    expect(grande.salida).toMatch(/RECORTADO/);
    expect(grande.salida.length).toBeLessThan(MAX_SALIDA + 200);
  });

  it("encuentra la categoría como la escribe una persona, y no adivina", () => {
    const servicios = [
      { id: 5, nombre: "Cafetería", clave: "cafeteria" },
      { id: 10, nombre: "Clases de pádel", clave: "clases_padel" },
      { id: 2, nombre: "Academia Recreativa Pádel", clave: "academia_padel" },
      { id: 16, nombre: "Alquiler pádel", clave: "alquiler_padel" },
    ];
    expect(resolverServicio(servicios, "cafeteria").id).toBe(5);
    expect(resolverServicio(servicios, "  CLASES DE PADEL ").id).toBe(10);
    expect(resolverServicio(servicios, "alquiler_padel").id).toBe(16);
    expect(() => resolverServicio(servicios, "pádel")).toThrow(/varias categorías/);
    expect(() => resolverServicio(servicios, "spa")).toThrow(/Las categorías son/);
    expect(normalizar("Matrícula  Pádel")).toBe("matricula padel");
  });
});

describe("costo y ruta", () => {
  it("la entrada que sale del caché se cobra a su tarifa", () => {
    const uso = { entrada: 1_000_000, cache: 400_000, salida: 10_000 };
    // astra: 600 mil × $8 + 400 mil × $0,40 + 10 mil × $40, por millón
    expect(costoUsd(uso, "analisis")).toBeCloseTo(4.8 + 0.16 + 0.4, 6);
    expect(costoUsd(uso, "consulta")).toBeCloseTo((600_000 * 0.1 + 400_000 * 0.01 + 10_000 * 0.5) / 1e6, 9);
    expect(MODELOS.analisis.id).toBe("gpt-6.2-astra");
    expect(MODELOS.consulta.id).toBe("gpt-6-luna");
  });

  it("en la duda, el modelo grande", () => {
    expect(rutaDe("consulta")).toBe("consulta");
    for (const x of ["analisis", "duda", null, undefined, "otra cosa", 3]) expect(rutaDe(x)).toBe("analisis");
  });

  it("el encabezado lleva el día de la semana y la fecha de Colombia", () => {
    expect(encabezadoPregunta("2026-11-24")).toBe("Hoy es martes 2026-11-24 (hora de Colombia).");
  });
});

// ── El bucle, con un OpenAI de mentiras ──────────────────────────────────────

type Salida = { output: unknown[]; texto?: string; status?: string };

function openaiFalso(clasificacion: string, guion: (vuelta: number) => Salida) {
  const llamadas: Record<string, unknown>[] = [];
  const falso = {
    responses: {
      async create() {
        return { output_text: JSON.stringify({ tipo: clasificacion }), usage: { input_tokens: 100, output_tokens: 5 } };
      },
      stream(params: Record<string, unknown>) {
        // Copia del input: el motor lo sigue llenando después de cada llamada.
        llamadas.push({ ...params, input: [...(params.input as unknown[])] });
        const s = guion(llamadas.length);
        const eventos = s.texto ? [{ type: "response.output_text.delta", delta: s.texto }] : [];
        return {
          async *[Symbol.asyncIterator]() {
            yield* eventos;
          },
          async finalResponse() {
            return {
              output: s.output,
              output_text: s.texto ?? "",
              status: s.status ?? "completed",
              usage: { input_tokens: 1000, output_tokens: 50, input_tokens_details: { cached_tokens: 800 } },
            };
          },
        };
      },
    },
  };
  return { openai: falso as unknown as OpenAI, llamadas };
}

const llamada = (id: string, nombre: string, args: object) => ({
  type: "function_call",
  id: `fc_${id}`,
  call_id: `call_${id}`,
  name: nombre,
  arguments: JSON.stringify(args),
  status: "completed",
});
const mensaje = (texto: string) => ({
  type: "message",
  id: "msg_1",
  role: "assistant",
  status: "completed",
  content: [{ type: "output_text", text: texto, annotations: [] }],
});

describe("motor", () => {
  it("pide una herramienta, recibe el resultado y responde", async () => {
    const { openai, llamadas } = openaiFalso("consulta", (v) =>
      v === 1
        ? { output: [llamada("1", "herramienta_que_no_existe", {})], texto: "Déjame revisar…" }
        : { output: [mensaje("Son 547 fichas activas.")], texto: "Son 547 fichas activas." },
    );
    const eventos: EventoAgente[] = [];
    const r = await responder({
      openai,
      ctx,
      pregunta: "¿Cuántos clientes activos tenemos?",
      historial: [
        { rol: "usuario", contenido: "hola" },
        { rol: "agente", contenido: "¿En qué te ayudo?" },
      ],
      alEvento: (e) => eventos.push(e),
    });

    expect(r.ruta).toBe("consulta");
    expect(r.modelo).toBe("gpt-6-luna");
    expect(r.escalada).toBe(false);
    expect(r.texto).toBe("Son 547 fichas activas.");
    expect(r.vueltas).toBe(2);
    expect(r.incompleta).toBe(false);
    expect(r.herramientas).toHaveLength(1);
    expect(r.herramientas[0]).toMatchObject({ nombre: "herramienta_que_no_existe", ok: false });
    expect(r.uso).toEqual({ entrada: 2000, cache: 1600, salida: 100 });
    expect(r.costoUsd).toBeGreaterThan(0);

    // Eventos en orden: ruta → texto que se descarta → herramienta → texto final.
    expect(eventos.map((e) => e.tipo)).toEqual(["ruta", "texto", "texto_descartado", "herramienta", "texto"]);

    // Primera llamada: historial + la pregunta con la fecha; sin guardar en OpenAI;
    // el modelo pequeño no recibe la consulta libre.
    const primera = llamadas[0] as { model: string; store: boolean; input: { role?: string; content?: string }[]; tools: { name: string }[] };
    expect(primera.model).toBe("gpt-6-luna");
    expect(primera.store).toBe(false);
    expect(primera.input.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(primera.input[2].content).toMatch(/^Hoy es martes 2026-11-24 \(hora de Colombia\)\.\n\n¿Cuántos clientes/);
    expect(primera.tools.map((t) => t.name)).not.toContain("consulta_libre");

    // Segunda llamada: lleva la llamada del modelo y su resultado con el mismo call_id.
    const segunda = llamadas[1] as { input: { type?: string; call_id?: string; output?: string }[] };
    const salida = segunda.input.find((i) => i.type === "function_call_output");
    expect(salida?.call_id).toBe("call_1");
    expect(JSON.parse(salida!.output!).error).toMatch(/No existe/);
    expect(segunda.input.some((i) => i.type === "function_call" && i.call_id === "call_1")).toBe(true);
  });

  it("no se queda consultando para siempre: en la última vuelta tiene que responder", async () => {
    const { openai, llamadas } = openaiFalso("analisis", (v) =>
      v < MAX_VUELTAS ? { output: [llamada(String(v), "otra_que_no_existe", {})] } : { output: [mensaje("Con lo que alcancé a ver…")], texto: "Con lo que alcancé a ver…" },
    );
    const r = await responder({ openai, ctx, pregunta: "Hazme un informe completo de todo" });
    expect(r.ruta).toBe("analisis");
    expect(r.modelo).toBe("gpt-6.2-astra");
    expect(llamadas).toHaveLength(MAX_VUELTAS);
    expect((llamadas.at(-1) as { tool_choice: string }).tool_choice).toBe("none");
    expect((llamadas[0] as { tool_choice: string }).tool_choice).toBe("auto");
    expect(r.herramientas).toHaveLength(MAX_VUELTAS - 1);
    expect(r.texto).toMatch(/^Con lo que alcancé a ver…/);
  });

  it("si al pequeño no le alcanzan sus herramientas, la pregunta pasa entera al grande", async () => {
    // Caso real del banco (24-nov-2026): "¿qué niños llevan tres semanas sin venir?"
    // parecía una lista y solo se responde con la consulta libre.
    const { openai, llamadas } = openaiFalso("consulta", (v) =>
      v === 1
        ? { output: [llamada("1", "pasar_a_analisis", { motivo: "Hace falta cruzar asistencias por niño." })], texto: "Revisando…" }
        : { output: [mensaje("Son 7 niños.")], texto: "Son 7 niños." },
    );
    const eventos: EventoAgente[] = [];
    const r = await responder({ openai, ctx, pregunta: "¿Qué niños llevan tres semanas sin venir?", alEvento: (e) => eventos.push(e) });

    expect(r.escalada).toBe(true);
    expect(r.ruta).toBe("analisis");
    expect(r.modelo).toBe("gpt-6.2-astra");
    expect(r.texto).toBe("Son 7 niños.");
    const [p, s] = llamadas as { model: string; tools: { name: string }[]; input: { type?: string }[] }[];
    expect(p.model).toBe("gpt-6-luna");
    expect(p.tools.map((t) => t.name)).toContain("pasar_a_analisis");
    expect(s.model).toBe("gpt-6.2-astra");
    expect(s.tools.map((t) => t.name)).not.toContain("pasar_a_analisis");
    expect(s.tools.map((t) => t.name)).toContain("consulta_libre");
    // El grande empieza de cero: sin el intento del pequeño en su entrada.
    expect(s.input.some((i) => i.type === "function_call")).toBe(false);
    expect(eventos.filter((e) => e.tipo === "ruta").map((e) => (e as { ruta: string }).ruta)).toEqual(["consulta", "analisis"]);
    expect(eventos.some((e) => e.tipo === "texto_descartado")).toBe(true);
    // El costo incluye el intento del pequeño.
    expect(r.costoUsd).toBeGreaterThan(costoUsd(r.uso, "analisis"));
  });

  it("si la respuesta se corta, lo dice", async () => {
    const { openai } = openaiFalso("consulta", () => ({ output: [mensaje("La cartera es de")], texto: "La cartera es de", status: "incomplete" }));
    const r = await responder({ openai, ctx, pregunta: "¿Cuánto nos deben?" });
    expect(r.incompleta).toBe(true);
    expect(r.texto).toMatch(/quedó incompleta/);
  });
});

// ── Ocupación por franja (EasyCancha), con reservas inventadas ───────────────

const reserva = (p: Partial<EcBooking>): EcBooking =>
  ({
    id: Math.random().toString(36),
    courtId: 1,
    courtName: "Cancha 1",
    sportId: 1,
    sportName: "Tenis",
    localDate: "2026-11-16",
    localStartTime: "08:00",
    localEndTime: "09:00",
    timespan: 60,
    userEmail: "cliente@example.com",
    status: "PAID",
    comments: null,
    ...p,
  }) as EcBooking;

describe("ocupación por franja", () => {
  it("minutos de cancha por día de la semana y hora, separando clase, alquiler e interno", () => {
    const lunes = "2026-11-16";
    const martes = "2026-11-17";
    const r = franjasDeReservas(
      [
        reserva({ courtName: "Profesor Leo Ruiz - Cancha 1", localDate: lunes, localStartTime: "08:00", localEndTime: "10:00" }), // clase
        reserva({ courtName: "Cancha 2", localDate: lunes, localStartTime: "10:00", localEndTime: "11:00", userEmail: "agentecdaf@gmail.com" }), // interno
        reserva({ courtName: "Cancha 1", localDate: martes, localStartTime: "07:30", localEndTime: "08:30" }), // alquiler
        reserva({ courtName: "Cancha 3", localDate: martes, localStartTime: "15:00", localEndTime: "16:00", status: "CANCELLED" }), // no cuenta
        reserva({ courtName: "Cancha 1", localDate: "2026-11-18", localStartTime: "15:00", localEndTime: "16:00" }), // fuera del rango
        reserva({ sportName: "Pádel", courtName: "Cancha 2", localDate: lunes, localStartTime: "20:00", localEndTime: "22:00" }), // se recorta a las 9 p. m.
      ],
      [lunes, martes],
    );
    const t = r.tenis;
    expect(t.canchas).toBe(4);
    expect(t.fechas).toBe(2);
    expect(t.horas[0]).toBe("07");
    expect(t.horas.at(-1)).toBe("20");
    // Lunes: 4 canchas × 60 min disponibles por hora.
    expect(t.matriz.lunes[1]).toBe(25); // 8 a. m.: 60 de 240
    expect(t.matriz.lunes[2]).toBe(25); // 9 a. m.
    expect(t.matriz.lunes[3]).toBe(25); // 10 a. m.: el bloqueo interno ocupa…
    expect(t.matrizVenta.lunes[3]).toBe(0); // …pero no es venta
    expect(t.matriz.martes[0]).toBe(13); // 7 a. m.: 30 de 240 = 12,5
    expect(t.matriz.martes[8]).toBe(0); // la cancelada no ocupa
    expect(t.matriz.miércoles.every((x) => x === 0)).toBe(true); // sin fechas de miércoles
    // Total: 240 min ocupados de 2 días × 4 canchas × 14 h × 60 min = 6.720.
    expect(t.pct).toBe(3.6);
    expect(t.pctClases).toBe(1.8);
    expect(t.pctInterno).toBe(0.9);
    expect(t.pctAlquiler).toBe(0.9);
    expect(r.padel.matriz.lunes[13]).toBe(25); // 8 p. m. (la parte de las 9 a las 10 queda fuera)
  });
});
