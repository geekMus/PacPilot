import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL("..", import.meta.url)),
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
        "server/utils/settings-validation.ts",
        "server/utils/url-safety.ts",
        "server/utils/origin-policy.ts",
        "server/services/remote-list.ts",
      ],
      thresholds: { statements: 90, branches: 90, functions: 90, lines: 90 },
    },
  },
});
