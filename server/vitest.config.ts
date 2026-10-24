import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL("..", import.meta.url)),
  resolve: {
    alias: {
      "@shared": fileURLToPath(new URL("../shared", import.meta.url)),
      "@server": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["server/tests/**/*.test.ts"],
    exclude: ["server/tests/core-validation.test.ts"],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "lcov", "html"],
      reportsDirectory: "coverage/server",
      include: [
        // Business layers only: routing, config loading and the SQLite driver
        // need a real Bun runtime, so they stay outside the Node coverage gate.
        "server/domain/**/*.ts",
        "server/services/**/*.ts",
        "server/storage/**/*.ts",
        "server/utils/**/*.ts",
      ],
      exclude: [
        // Pure type declarations and the Bun-only SQLite adapter.
        "server/storage/repositories.ts",
        "server/storage/sqlite/**",
      ],
      thresholds: { statements: 90, branches: 90, functions: 90, lines: 90 },
    },
  },
});
