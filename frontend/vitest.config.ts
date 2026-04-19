import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      enabled: false,
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "coverage/unit",
      include: ["src/lib/**/*.{js,ts}"],
      thresholds: {
        statements: 85,
        branches: 75,
        functions: 85,
        lines: 85,
      },
    },
  },
});
