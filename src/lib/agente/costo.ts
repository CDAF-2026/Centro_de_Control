/**
 * Agente IA: los dos modelos y lo que cuesta cada respuesta.
 *
 * Decisión de Laura (24-nov-2026): dos modelos de OpenAI con la llave que ya tenía
 * el proyecto. `analisis` (gpt-6.2-astra) para lo que exige razonar: preguntas de
 * negocio, propuestas, informes. `consulta` (gpt-6-luna) para lo que solo es traer
 * un dato. El reparto es invisible para quien pregunta.
 *
 * Precios por millón de tokens, en dólares, tomados de la página de precios de
 * OpenAI el 24-nov-2026 (tarifa estándar). Si OpenAI los cambia, cambiarlos aquí:
 * solo sirven para medir el gasto, no deciden nada.
 */
export const MODELOS = {
  analisis: {
    id: "gpt-6.2-astra",
    esfuerzo: "medium",
    maxSalida: 16000,
    precio: { entrada: 8, cache: 0.4, salida: 40 },
  },
  consulta: {
    id: "gpt-6-luna",
    esfuerzo: "low",
    maxSalida: 6000,
    precio: { entrada: 0.1, cache: 0.01, salida: 0.5 },
  },
} as const;

export type Ruta = keyof typeof MODELOS;

/** Tokens de una o varias llamadas. `cache` es la parte de `entrada` que salió del caché. */
export type Uso = { entrada: number; cache: number; salida: number };

export const USO_CERO: Uso = { entrada: 0, cache: 0, salida: 0 };

export function sumarUso(a: Uso, b: Uso): Uso {
  return { entrada: a.entrada + b.entrada, cache: a.cache + b.cache, salida: a.salida + b.salida };
}

/** El `usage` de una respuesta de OpenAI, en nuestro formato. */
export function usoDe(usage: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } } | null | undefined): Uso {
  return {
    entrada: usage?.input_tokens ?? 0,
    cache: usage?.input_tokens_details?.cached_tokens ?? 0,
    salida: usage?.output_tokens ?? 0,
  };
}

/** Dólares de un uso con la tarifa de un modelo. La entrada cacheada se cobra aparte, más barata. */
export function costoUsd(uso: Uso, ruta: Ruta): number {
  const p = MODELOS[ruta].precio;
  const sinCache = Math.max(uso.entrada - uso.cache, 0);
  return (sinCache * p.entrada + uso.cache * p.cache + uso.salida * p.salida) / 1_000_000;
}
