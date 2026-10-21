import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  root: fileURLToPath(new URL("..", import.meta.url)),
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shared": fileURLToPath(new URL("../shared", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    environmentOptions: {
      jsdom: { url: "http://localhost/" },
    },
    include: ["tests/client/**/*.test.ts"],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "lcov", "html"],
      reportsDirectory: "coverage/client",
      include: [
        "client/src/utils/admin-settings-validation.ts",
        "client/src/utils/domain-rules.ts",
        "client/src/utils/time-zones.ts",
        "client/src/composables/useTheme.ts",
      ],
      exclude: ["client/src/**/*.d.ts"],
      thresholds: { statements: 90, branches: 90, functions: 90, lines: 90 },
    },
  },
});
