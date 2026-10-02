import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // `server-only` throws outside React Server Components; tests import server modules directly.
      "server-only": path.resolve(import.meta.dirname, "test/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Database tests use an in-memory PGlite, never ./data or a real DATABASE_URL.
    env: { PGLITE_DIR: "memory://", DATABASE_URL: "", NETLIFY_DATABASE_URL: "", CONTENT_DIR: "content/_sample" },
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
