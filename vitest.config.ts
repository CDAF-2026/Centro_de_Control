import { defineConfig } from "vitest/config";
import { config } from "dotenv";

// Carga .env (PG*, DATABASE_URL) en process.env para los tests.
config();

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
