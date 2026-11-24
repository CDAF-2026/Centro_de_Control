import { defineConfig } from "vitest/config";
import { config } from "dotenv";
import path from "node:path";

// Banco de preguntas del Agente IA (scripts/agente-banco.banco.ts). Va aparte de
// `npm test` a propósito: gasta en OpenAI y tarda minutos. Es una copia corta de
// vitest.config.ts y no un mergeConfig: mergeConfig SUMA las listas de `include`
// y correría también todas las pruebas.
config();

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["scripts/agente-banco.banco.ts"],
    testTimeout: 60 * 60 * 1000,
  },
});
