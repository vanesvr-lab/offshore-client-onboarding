import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(__dirname, ".env.test") });

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: "jsdom",
    environmentMatchGlobs: [
      ["tests/integration/**", "node"],
    ],
    setupFiles: ["tests/setup/vitest.setup.ts"],
    include: ["tests/unit/**/*.test.{ts,tsx}", "tests/integration/**/*.test.{ts,tsx}"],
    exclude: ["tests/e2e/**", "node_modules/**", ".next/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: [
        "src/lib/**",
        "src/stores/**",
        "src/app/api/applications/**",
        "src/app/api/documents/**",
        "src/app/api/kyc/**",
      ],
      exclude: [
        "src/app/**/page.tsx",
        "src/components/**",
        "**/*.d.ts",
        "**/types/**",
      ],
      thresholds: {
        "src/lib/**": {
          lines: 70,
          functions: 70,
          branches: 50,
          statements: 70,
        },
      },
    },
  },
});
