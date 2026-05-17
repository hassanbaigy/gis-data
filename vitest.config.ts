import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Vitest config for unit tests. Lives at repo root; e2e specs remain under
 * tests/e2e/ owned by Playwright. Vitest only picks up tests/unit/**.
 */
export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    pool: "forks",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
