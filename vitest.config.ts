import { defineConfig } from "vitest/config";
import { config } from "dotenv";
import path from "node:path";

// Carga .env (PG*, DATABASE_URL) en process.env para los tests.
config();

export default defineConfig({
  // Las pruebas de render importan páginas reales, que usan el alias "@/".
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // Lo inyecta Next en su propio build; en vitest hay que darle algo.
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
