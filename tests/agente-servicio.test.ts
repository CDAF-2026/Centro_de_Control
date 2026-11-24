import { describe, it, expect, vi } from "vitest";
import { atenderPregunta, tituloDe, type NuevoMensaje, type Repositorio } from "@/lib/agente/servicio";
import { codificar, fuentesDe, LectorLineas, type LineaChat } from "@/lib/agente/protocolo";
import type { RespuestaAgente } from "@/lib/agente/motor";
import type { Mensaje } from "@/lib/agente/enrutador";

/**
 * Agente IA · Fase 1, paso 3 (24-nov-2026): atender una pregunta de punta a punta
 * (sin base ni OpenAI: piezas de mentira), lo que viaja a la pantalla y el guardia
 * de la ruta.
 */

function repoFalso(opts: { duena?: boolean; historial?: Mensaje[] } = {}) {
  const guardados: NuevoMensaje[] = [];
  const creadas: { perfil: string; titulo: string }[] = [];
  const tocadas: number[] = [];
  let id = 100;
  const repo: Repositorio = {
    esDuena: async () => opts.duena ?? true,
    crear: async (perfil, titulo) => {
      creadas.push({ perfil, titulo });
      return 7;
    },
    historial: async () => opts.historial ?? [],
    guardar: async (m) => {
      guardados.push(m);
      return { id: ++id, created_at: "2026-11-24T13:00:00Z" };
    },
    tocar: async (c) => {
      tocadas.push(c);
    },
  };
  return { repo, guardados, creadas, tocadas };
}

const RESPUESTA: RespuestaAgente = {
  texto: "Se facturaron **$292.235.522**.",
  ruta: "consulta",
  modelo: "gpt-6-luna",
  escalada: false,
  herramientas: [
    { nombre: "ingresos", etiqueta: "Consultando los ingresos en Siigo…", argumentos: {}, ok: true, fuente: "Facturas de Siigo", periodo: "2026-10-01 a 2026-10-31", ms: 10 },
    { nombre: "ingresos", etiqueta: "x", argumentos: {}, ok: true, fuente: "Facturas de Siigo", periodo: "2026-10-01 a 2026-10-31", ms: 10 },
    { nombre: "cartera", etiqueta: "x", argumentos: {}, ok: false, error: "falló", ms: 3 },
  ],
  uso: { entrada: 9000, cache: 8000, salida: 70 },
  costoUsd: 0.000_312_5,
  vueltas: 2,
  incompleta: false,
};

describe("atender una pregunta", () => {
  it("conversación nueva: la crea con la pregunta de título, guarda las dos partes y avisa en orden", async () => {
    const { repo, guardados, creadas, tocadas } = repoFalso();
    const lineas: LineaChat[] = [];
    const registrar = vi.fn(async () => {});
    await atenderPregunta(
      { pregunta: "  ¿Cuánto se facturó en octubre?  ", conversacionId: null, perfilId: "perfil-1" },
      {
        repo,
        emitir: (l) => lineas.push(l),
        registrar,
        correr: async ({ alEvento, historial }) => {
          expect(historial).toEqual([]);
          alEvento({ tipo: "ruta", ruta: "consulta" });
          alEvento({ tipo: "herramienta", nombre: "ingresos", etiqueta: "Consultando los ingresos en Siigo…" });
          alEvento({ tipo: "texto", delta: "Se facturaron " });
          alEvento({ tipo: "texto", delta: "**$292.235.522**." });
          return RESPUESTA;
        },
      },
    );

    expect(creadas).toEqual([{ perfil: "perfil-1", titulo: "¿Cuánto se facturó en octubre?" }]);
    expect(guardados.map((g) => [g.rol, g.contenido])).toEqual([
      ["usuario", "¿Cuánto se facturó en octubre?"],
      ["agente", RESPUESTA.texto],
    ]);
    // La respuesta guarda con qué se calculó y cuánto costó (para medir el mes de prueba).
    expect(guardados[1]).toMatchObject({ modelo: "gpt-6-luna", tokens_entrada: 9000, tokens_cache: 8000, tokens_salida: 70, costo_usd: 0.000313 });
    expect(guardados[1].herramientas).toHaveLength(3);
    expect(tocadas).toEqual([7]);
    expect(registrar).toHaveBeenCalledOnce();

    // A la pantalla NO viaja qué modelo respondió, ni nombres internos, ni el costo.
    expect(lineas.map((l) => l.tipo)).toEqual(["inicio", "consultando", "texto", "texto", "fin"]);
    expect(JSON.stringify(lineas)).not.toMatch(/gpt-6|ruta|costo|"ingresos"/);
    expect(lineas[0]).toMatchObject({ tipo: "inicio", conversacionId: 7, pregunta: { id: 101, rol: "usuario" } });
    expect(lineas.at(-1)).toEqual({
      tipo: "fin",
      respuesta: {
        id: 102,
        rol: "agente",
        contenido: RESPUESTA.texto,
        // Solo lo que salió bien, sin repetir.
        fuentes: [{ fuente: "Facturas de Siigo", periodo: "2026-10-01 a 2026-10-31" }],
        created_at: "2026-11-24T13:00:00Z",
      },
    });
  });

  it("conversación existente: le pasa al agente lo que se habló antes", async () => {
    const historial: Mensaje[] = [
      { rol: "usuario", contenido: "¿Cuánto se facturó en octubre?" },
      { rol: "agente", contenido: "$292.235.522" },
    ];
    const { repo, creadas } = repoFalso({ historial });
    const correr = vi.fn(async (_a: { pregunta: string; historial: Mensaje[] }) => RESPUESTA);
    await atenderPregunta({ pregunta: "¿Y en septiembre?", conversacionId: 7, perfilId: "p" }, { repo, emitir: () => {}, correr });
    expect(creadas).toEqual([]);
    expect(correr.mock.calls[0][0]).toMatchObject({ pregunta: "¿Y en septiembre?", historial });
  });

  it("una conversación ajena no se toca ni se revela", async () => {
    const { repo, guardados } = repoFalso({ duena: false });
    const lineas: LineaChat[] = [];
    const correr = vi.fn(async () => RESPUESTA);
    await atenderPregunta({ pregunta: "hola", conversacionId: 9, perfilId: "p" }, { repo, emitir: (l) => lineas.push(l), correr });
    expect(lineas).toEqual([{ tipo: "error", mensaje: "Esa conversación no existe." }]);
    expect(correr).not.toHaveBeenCalled();
    expect(guardados).toEqual([]);
  });

  it("si el agente falla, queda escrito en la conversación y se avisa", async () => {
    const { repo, guardados } = repoFalso();
    const lineas: LineaChat[] = [];
    const errorOriginal = console.error;
    console.error = () => {};
    try {
      await atenderPregunta(
        { pregunta: "¿Cuánto nos deben?", conversacionId: null, perfilId: "p" },
        { repo, emitir: (l) => lineas.push(l), correr: async () => { throw new Error("429 rate limit"); } },
      );
    } finally {
      console.error = errorOriginal;
    }
    expect(guardados.map((g) => g.rol)).toEqual(["usuario", "agente"]);
    expect(guardados[1].contenido).toMatch(/No pude responder/);
    expect(lineas.map((l) => l.tipo)).toEqual(["inicio", "error"]);
    // El detalle técnico no llega a la pantalla.
    expect(JSON.stringify(lineas)).not.toMatch(/429/);
  });

  it("el título es la pregunta, recortada", () => {
    expect(tituloDe("  hola\n  mundo ")).toBe("hola mundo");
    const larga = "a".repeat(120);
    expect(tituloDe(larga)).toHaveLength(80);
    expect(tituloDe(larga).endsWith("…")).toBe(true);
  });
});

describe("lo que viaja a la pantalla", () => {
  it("arma las líneas aunque lleguen partidas", () => {
    const l1: LineaChat = { tipo: "texto", delta: "Hola, ¿qué tal? 💡" };
    const l2: LineaChat = { tipo: "consultando", etiqueta: "Revisando la cartera…" };
    const todo = codificar(l1) + codificar(l2);
    const lector = new LectorLineas();
    const recibidas: LineaChat[] = [];
    for (let i = 0; i < todo.length; i += 7) recibidas.push(...lector.agregar(todo.slice(i, i + 7)));
    recibidas.push(...lector.terminar());
    expect(recibidas).toEqual([l1, l2]);
  });

  it("las fuentes: solo lo que salió bien, sin repetir, y nada si no es una lista", () => {
    expect(fuentesDe(null)).toEqual([]);
    expect(fuentesDe("x")).toEqual([]);
    expect(
      fuentesDe([
        { ok: true, fuente: "A", periodo: "p" },
        { ok: true, fuente: "A", periodo: "p" },
        { ok: true, fuente: "A" },
        { ok: false, fuente: "B" },
        { ok: true },
      ]),
    ).toEqual([{ fuente: "A", periodo: "p" }, { fuente: "A" }]);
  });
});

// ── El guardia de la ruta (handoff §1.12: el de la página no protege la ruta) ──
let PERFIL: { id: string; role: string; activo: boolean } | null = null;
vi.mock("@/lib/auth", () => ({ getProfile: async () => PERFIL }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    throw new Error("no debería llegar a la base");
  },
}));

describe("POST /agente/chat", () => {
  const pedir = async (cuerpo: unknown) => {
    const { POST } = await import("../src/app/(app)/agente/chat/route");
    return POST(new Request("http://x/agente/chat", { method: "POST", body: JSON.stringify(cuerpo) }));
  };

  it("sin sesión, otro rol o cuenta dada de baja: 403 y no toca nada", async () => {
    PERFIL = null;
    expect((await pedir({ pregunta: "hola", conversacionId: null })).status).toBe(403);
    PERFIL = { id: "p", role: "coord_admin", activo: true };
    expect((await pedir({ pregunta: "hola", conversacionId: null })).status).toBe(403);
    PERFIL = { id: "p", role: "superadmin", activo: false };
    expect((await pedir({ pregunta: "hola", conversacionId: null })).status).toBe(403);
  });

  it("leer una conversación (la mascota al retomar): mismo guardia, y un id raro es 400", async () => {
    const { GET } = await import("../src/app/(app)/agente/chat/route");
    PERFIL = { id: "p", role: "recepcion", activo: true };
    expect((await GET(new Request("http://x/agente/chat?c=5"))).status).toBe(403);
    PERFIL = { id: "p", role: "superadmin", activo: true };
    expect((await GET(new Request("http://x/agente/chat?c=abc"))).status).toBe(400);
    expect((await GET(new Request("http://x/agente/chat"))).status).toBe(400);
  });

  it("pregunta vacía o demasiado larga: 400", async () => {
    PERFIL = { id: "p", role: "superadmin", activo: true };
    expect((await pedir({ pregunta: "   ", conversacionId: null })).status).toBe(400);
    expect((await pedir({ pregunta: "x".repeat(4001), conversacionId: null })).status).toBe(400);
    expect((await pedir({ pregunta: "hola", conversacionId: "abc" })).status).toBe(400);
  });
});
